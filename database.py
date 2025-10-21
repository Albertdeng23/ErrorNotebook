import sqlite3
import json
from datetime import datetime
# 定义数据库文件的名称
DATABASE_NAME = "database.db"

def get_db_connection():
    """
    创建一个数据库连接。
    使用 sqlite3.Row 作为 row_factory，这样查询结果可以像字典一样通过列名访问。
    """
    conn = sqlite3.connect(DATABASE_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """
    初始化数据库，创建错题表 (questions)。
    这个函数应该在应用启动时被调用一次。
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                subject TEXT NOT NULL,
                upload_date TEXT NOT NULL,
                original_image_b64 TEXT NOT NULL,
                user_question TEXT, -- 新增：存储用户的原始疑问，用于重新生成
                problem_analysis TEXT,
                knowledge_points TEXT,
                ai_analysis TEXT, -- 存储“可能的错误”
                similar_examples TEXT -- 存储“相似例题”
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS daily_summaries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_date TEXT NOT NULL UNIQUE,
                general_summary TEXT,
                knowledge_points_summary TEXT,
                question_count INTEGER,
                subject_chart_data TEXT,
                created_at TEXT NOT NULL
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS careless_mistakes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_date TEXT NOT NULL,
                original_image_b64 TEXT NOT NULL,
                user_reflection TEXT NOT NULL
            );
        """)
        conn.commit()
        print("Database initialized and 'questions' table is ready.")

# --- 数据写入/修改操作 ---

# --- 【新增】为 careless_mistakes 表添加写入函数 ---
def add_careless_mistake(mistake_data: dict):
    """将一条粗心错误记录添加到数据库中。"""
    sql = """
        INSERT INTO careless_mistakes (
            upload_date, original_image_b64, user_reflection
        ) VALUES (?, ?, ?);
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(sql, (
                mistake_data.get('upload_date'),
                mistake_data.get('original_image_b64'),
                mistake_data.get('user_reflection')
            ))
            conn.commit()
            print("Successfully added a new careless mistake.")
        except sqlite3.Error as e:
            print(f"Failed to add careless mistake to database. Error: {e}")

# --- 【新增】为 careless_mistakes 表添加查询函数 (支持分页) ---
def get_careless_mistakes(limit: int, offset: int) -> list:
    """分页获取所有粗心错误记录。"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM careless_mistakes ORDER BY upload_date DESC LIMIT ? OFFSET ?"
        cursor.execute(query, (limit, offset))
        return cursor.fetchall()

def add_question(question_data: dict):
    """
    将一个处理好的错题数据字典添加到数据库中。
    """
    sql = """
        INSERT INTO questions (
            subject, upload_date, original_image_b64, user_question, problem_analysis, 
            knowledge_points, ai_analysis, similar_examples
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute(sql, (
                question_data.get('subject'),
                question_data.get('upload_date'),
                question_data.get('original_image_b64'),
                question_data.get('user_question'), # 新增
                question_data.get('problem_analysis'),
                question_data.get('knowledge_points'),
                question_data.get('ai_analysis'),
                question_data.get('similar_examples')
            ))
            conn.commit()
            print(f"Successfully added a new question for subject: {question_data.get('subject')}")
        except sqlite3.Error as e:
            print(f"Failed to add question to database. Error: {e}")

def update_question_analysis(question_id: int, new_data: dict):
    """根据ID更新一条错题的AI分析相关字段"""
    with get_db_connection() as conn:
        conn.execute('''
            UPDATE questions
            SET problem_analysis = ?,
                knowledge_points = ?,
                ai_analysis = ?,
                similar_examples = ?
            WHERE id = ?
        ''', (
            new_data.get('problem_analysis'),
            new_data.get('knowledge_points'),
            new_data.get('ai_analysis'),
            new_data.get('similar_examples'),
            question_id
        ))
        conn.commit()

def delete_question(question_id: int):
    """根据ID删除一条错题记录"""
    with get_db_connection() as conn:
        conn.execute('DELETE FROM questions WHERE id = ?', (question_id,))
        conn.commit()

# --- 数据查询操作 ---

def get_question_by_id(question_id: int):
    """根据ID获取一条错题记录的完整信息"""
    with get_db_connection() as conn:
        question = conn.execute('SELECT * FROM questions WHERE id = ?', (question_id,)).fetchone()
        return question

def get_questions_by_subject(subject: str, limit: int, offset: int, start_date: str = None) -> list:
    """
    根据科目名称查询错题，支持分页和起始日期。
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM questions WHERE subject = ?"
        params = [subject]
        
        if start_date:
            query += " AND date(upload_date) <= ?"
            params.append(start_date)
            
        query += " ORDER BY upload_date DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, tuple(params))
        return cursor.fetchall()

def get_questions_by_date(date_str: str) -> list:
    """获取指定日期的所有错题记录"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM questions WHERE date(upload_date) = ?", (date_str,))
        return cursor.fetchall()

def get_all_subjects() -> list:
    """从数据库中查询出所有不重复的科目列表"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT subject FROM questions ORDER BY subject ASC")
        return [row['subject'] for row in cursor.fetchall()]

def get_all_question_dates() -> list:
    """获取所有不重复的错题日期列表，用于生成时间线"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT date(upload_date) as entry_date FROM questions ORDER BY entry_date DESC")
        return [row['entry_date'] for row in cursor.fetchall()]

# --- 统计与总结查询 ---

def get_latest_question_date() -> str:
    """获取数据库中最新一条记录的日期 (YYYY-MM-DD)"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(date(upload_date)) FROM questions")
        result = cursor.fetchone()
        return result[0] if result else None

def get_weekly_summary_stats() -> list:
    """获取过去7天内每天新增的错题数量"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT date(upload_date) as entry_date, COUNT(id) as count
            FROM questions
            WHERE date(upload_date) >= date('now', '-6 days')
            GROUP BY entry_date
            ORDER BY entry_date ASC;
        """)
        return cursor.fetchall()

# 在 database.py 文件末尾添加这个新函数

def migrate_db():
    """
    检查并更新数据库表结构，以实现平滑升级。
    """
    print("Checking database schema...")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # 1. 获取 'questions' 表的所有列信息
        cursor.execute("PRAGMA table_info(questions)")
        columns = [row['name'] for row in cursor.fetchall()]
        
        # 2. 检查 'user_question' 列是否存在
        if 'user_question' not in columns:
            try:
                print("Column 'user_question' not found. Adding it now...")
                # 使用 ALTER TABLE 添加新列，并设置一个默认值
                cursor.execute("ALTER TABLE questions ADD COLUMN user_question TEXT DEFAULT ''")
                conn.commit()
                print("Successfully added 'user_question' column to the database.")
            except sqlite3.Error as e:
                print(f"Failed to add 'user_question' column. Error: {e}")
        else:
            print("Column 'user_question' already exists. No migration needed.")

def add_daily_summary(summary_data: dict):
    """将生成的每日总结存入数据库"""
    sql = """
        INSERT INTO daily_summaries (
            summary_date, general_summary, knowledge_points_summary,
            question_count, subject_chart_data, created_at
        ) VALUES (?, ?, ?, ?, ?, ?);
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute(sql, (
            summary_data['date'],
            summary_data['ai_summary']['general_summary'],
            json.dumps(summary_data['ai_summary']['knowledge_points_summary'], ensure_ascii=False),
            summary_data['question_count'],
            json.dumps(summary_data['subject_chart_data'], ensure_ascii=False),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ))
        conn.commit()
        print(f"Saved daily summary for date: {summary_data['date']}")

def get_summary_by_date(date_str: str):
    """根据日期从数据库获取已保存的总结"""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM daily_summaries WHERE summary_date = ?", (date_str,))
        summary = cursor.fetchone()
        return summary


# --- 用于独立测试本模块功能的示例 ---
if __name__ == '__main__':
    print("--- Running database module tests ---")
    init_db()
    
    # 构造测试数据
    test_question = {
        "subject": "物理化学",
        "upload_date": "2025-10-10 10:00:00",
        "original_image_b64": "test_base64_string",
        "user_question": "为什么是这个公式？",
        "problem_analysis": "这是关于克拉伯龙方程的解析...",
        "knowledge_points": json.dumps(["理想气体", "状态方程"], ensure_ascii=False),
        "ai_analysis": json.dumps(["单位错误"], ensure_ascii=False),
        "similar_examples": json.dumps([{"question": "例题？", "answer": "答案。"}], ensure_ascii=False)
    }
    add_question(test_question)
    
    print("\n--- Testing get_all_subjects ---")
    subjects = get_all_subjects()
    print(f"Subjects: {subjects}")
    assert "物理化学" in subjects

    print("\n--- Testing paginated get_questions_by_subject ---")
    questions_page1 = get_questions_by_subject("物理化学", limit=1, offset=0)
    print(f"Page 1 has {len(questions_page1)} item(s).")
    assert len(questions_page1) == 1
    print(f"Item ID: {questions_page1[0]['id']}, User Question: {questions_page1[0]['user_question']}")

    print("\n--- Testing get_latest_question_date ---")
    latest_date = get_latest_question_date()
    print(f"Latest date: {latest_date}")
    assert latest_date == "2025-10-10"

    print("\n--- Database module tests completed successfully! ---")

