import json
import base64
from datetime import date, timedelta
from collections import Counter

from flask import Flask, render_template, request, jsonify
from markdown_it import MarkdownIt

# 从我们自己的模块中导入所需函数
import core
import database

# --- 1. 初始化 Flask 应用和扩展 ---
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-super-secret-key-for-wrong-answer-book'

# 初始化 Markdown 转换器
md = MarkdownIt()

# 定义并注册一个自定义的 Markdown 过滤器，以便在模板中使用
def markdown_filter(text):
    """将Markdown文本转换为HTML"""
    if not text:
        return ""
    return md.render(text)

app.jinja_env.filters['markdown'] = markdown_filter


# --- 2. 数据库初始化 ---
# 在应用启动时，确保数据库和表已经创建好
with app.app_context():
    database.init_db()
    database.migrate_db()

# --- 3. 路由和API端点 ---

@app.route('/')
def index():
    """
    主页面路由。
    (已重构为持久化每日总结)
    """
    print("Loading main page...")
    
    # --- 全新的每日总结逻辑 ---
    daily_summary = None
    yesterday_str = (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")

    # 1. 尝试从数据库读取昨天的总结
    saved_summary = database.get_summary_by_date(yesterday_str)

    if saved_summary:
        print(f"Found saved summary for {yesterday_str} in database.")
        # 2. 如果找到了，直接使用数据库中的数据
        daily_summary = {
            "date": saved_summary['summary_date'],
            "ai_summary": {
                "general_summary": saved_summary['general_summary'],
                "knowledge_points_summary": json.loads(saved_summary['knowledge_points_summary'])
            },
            "question_count": saved_summary['question_count'],
            "subject_chart_data": json.loads(saved_summary['subject_chart_data'])
        }
    else:
        # 3. 如果数据库中没有，再检查昨天是否有错题记录，以决定是否需要生成
        print(f"No saved summary for {yesterday_str}. Checking for yesterday's questions...")
        yesterday_questions = database.get_questions_by_date(yesterday_str)
        
        if yesterday_questions:
            print(f"Found {len(yesterday_questions)} questions from yesterday. Generating new summary...")
            # 4. 只有在昨天确实有错题时，才调用AI生成并保存
            summary_text_list = []
            subjects_list = []
            for q in yesterday_questions:
                summary_text_list.append(q['problem_analysis'])
                k_points = json.loads(q['knowledge_points'])
                summary_text_list.extend(k_points)
                subjects_list.append(q['subject'])
            
            ai_summary_content = core.generate_daily_summary_with_ai("\n".join(summary_text_list))
            subject_counts = Counter(subjects_list)
            
            # 组装成完整的总结数据结构
            daily_summary = {
                "date": yesterday_str,
                "ai_summary": ai_summary_content,
                "question_count": len(yesterday_questions),
                "subject_chart_data": {
                    "labels": list(subject_counts.keys()),
                    "data": list(subject_counts.values())
                }
            }
            
            # 5. 将新生成的总结存入数据库，供今天后续访问使用
            if 'error' not in ai_summary_content:
                database.add_daily_summary(daily_summary)
        else:
            print("No questions from yesterday. No summary will be generated.")

    # --- 周度图表逻辑 (保持不变) ---
    weekly_stats_raw = database.get_weekly_summary_stats()
    last_7_days = [(date.today() - timedelta(days=i)).strftime("%Y-%m-%d") for i in range(6, -1, -1)]
    stats_dict = {day: 0 for day in last_7_days}
    for row in weekly_stats_raw:
        stats_dict[row['entry_date']] = row['count']
    weekly_chart_data = { "labels": list(stats_dict.keys()), "data": list(stats_dict.values()) }

    # --- 错题回顾的科目和时间线逻辑 (保持不变) ---
    subjects = database.get_all_subjects()
    all_dates = database.get_all_question_dates()
    
    return render_template(
        'index.html', 
        subjects=subjects, 
        all_dates=all_dates,
        daily_summary=daily_summary,
        weekly_chart_data=weekly_chart_data
    )


@app.route('/get-questions')
def get_questions():
    """
    【核心API】提供分页错题数据的API端点。
    前端通过此接口实现按需加载和无限滚动。
    """
    try:
        subject = request.args.get('subject', type=str)
        page = request.args.get('page', 1, type=int)
        start_date = request.args.get('start_date', None, type=str)
        
        if not subject:
            return jsonify({"error": "Subject is required"}), 400

        limit = 3 # 每次加载3条
        offset = (page - 1) * limit
        
        raw_questions = database.get_questions_by_subject(subject, limit, offset, start_date)
        
        questions_list = []
        for q_row in raw_questions:
            q_dict = dict(q_row)
            try:
                q_dict['knowledge_points'] = json.loads(q_dict['knowledge_points'])
                q_dict['ai_analysis'] = json.loads(q_dict['ai_analysis'])
                q_dict['similar_examples'] = json.loads(q_dict['similar_examples'])
            except (json.JSONDecodeError, TypeError):
                q_dict['knowledge_points'], q_dict['ai_analysis'], q_dict['similar_examples'] = [], [], []
            questions_list.append(q_dict)
            
        return jsonify(questions_list)
    except Exception as e:
        print(f"Error in /get-questions: {e}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/upload', methods=['POST'])
def upload_question():
    """处理错题上传的API端点。"""
    print("Received an upload request...")
    try:
        subject = request.form.get('subject')
        user_question = request.form.get('user_question', '')
        file = request.files.get('question_image')

        if not subject or not file or file.filename == '':
            return jsonify({'status': 'failed', 'message': '必须填写科目并选择图片！'}), 400

        image_bytes = file.read()
        
        print(f"Processing image for subject: {subject}...")
        processed_data = core.process_new_question(
            image_bytes=image_bytes,
            subject=subject,
            user_question=user_question
        )

        if 'error' in processed_data:
            print(f"AI analysis failed: {processed_data['error']}")
            return jsonify({'status': 'failed', 'message': f"AI分析失败: {processed_data['error']}"}), 500

        database.add_question(processed_data)
        
        print("Question processed and saved successfully.")
        return jsonify({'status': 'success', 'message': '错题上传并分析成功！'})

    except Exception as e:
        print(f"An unexpected error occurred in /upload: {e}")
        return jsonify({'status': 'failed', 'message': f'服务器内部错误: {e}'}), 500


@app.route('/delete/<int:question_id>', methods=['DELETE'])
def delete_question(question_id):
    """处理删除错题的API端点。"""
    try:
        print(f"Received request to delete question ID: {question_id}")
        database.delete_question(question_id)
        return jsonify({'status': 'success', 'message': '错题已删除'}), 200
    except Exception as e:
        print(f"Error deleting question {question_id}: {e}")
        return jsonify({'status': 'failed', 'message': f'删除失败: {e}'}), 500


@app.route('/regenerate/<int:question_id>', methods=['POST'])
def regenerate_analysis(question_id):
    """处理重新生成错题解析的API端点。"""
    try:
        print(f"Received request to regenerate analysis for question ID: {question_id}")
        question_data = database.get_question_by_id(question_id)
        if not question_data:
            return jsonify({'status': 'failed', 'message': '未找到该错题'}), 404

        image_b64 = question_data['original_image_b64']
        
        # 重新调用核心AI逻辑
        processed_data = core.process_new_question(
            image_bytes=base64.b64decode(image_b64),
            subject=question_data['subject'],
            user_question="" # 重新生成时不一定需要用户疑问，可根据需求修改
        )

        if 'error' in processed_data:
            return jsonify({'status': 'failed', 'message': f"AI分析失败: {processed_data['error']}"}), 500

        # 更新数据库中的解析数据
        database.update_question_analysis(question_id, processed_data)
        
        print(f"Successfully regenerated analysis for question ID: {question_id}")
        # 返回新数据给前端，让前端可以动态更新
        return jsonify({'status': 'success', 'message': '解析已重新生成', 'new_data': processed_data})

    except Exception as e:
        print(f"Error regenerating analysis for {question_id}: {e}")
        return jsonify({'status': 'failed', 'message': f'重新生成失败: {e}'}), 500


# --- 4. 启动应用 ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
