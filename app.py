import json
import base64
from datetime import date, timedelta,datetime
from collections import Counter
from whitenoise import WhiteNoise
from flask import Flask, render_template, request, jsonify
from markdown_it import MarkdownIt
from flask import Response, stream_with_context
# 从我们自己的模块中导入所需函数
import core
import database

# --- 1. 初始化 Flask 应用和扩展 ---
app = Flask(__name__)
app.wsgi_app = WhiteNoise(app.wsgi_app, root='static/')
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

# in app.py
@app.route('/')
def index():
    """
    主页面路由。
    【已修改】现在会主动加载最新一天的总结数据。
    """
    print("Loading main page shell...")
    
    # --- 【新增】初始总结逻辑 ---
    initial_summary_data = None
    latest_date = database.get_latest_question_date() # 获取最新记录的日期
    if latest_date:
        print(f"Latest question date is {latest_date}. Fetching initial summary...")
        initial_summary_data = get_or_generate_summary_for_date(latest_date)
    # --- 总结逻辑结束 ---

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
        weekly_chart_data=weekly_chart_data,
        initial_summary_data=initial_summary_data # <-- 【关键】将初始总结数据传递给模板
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


@app.route('/update-insight/<int:question_id>', methods=['POST'])
def update_insight(question_id):
    """保存/更新某条错题的'我的灵光一闪'短注释。前端通过 POST 提交 { insight: '...' }。"""
    try:
        data = request.get_json() or {}
        insight = data.get('insight', '') if isinstance(data, dict) else ''
        # 简单校验
        if insight is None:
            return jsonify({'status': 'failed', 'message': '缺少 insight 字段'}), 400

        database.update_question_insight(question_id, insight)
        return jsonify({'status': 'success', 'message': '注释已保存', 'insight': insight})
    except Exception as e:
        print(f"Error in /update-insight: {e}")
        return jsonify({'status': 'failed', 'message': f'保存失败: {e}'}), 500


# in app.py
@app.route('/get-summary/<string:date_str>')
def get_summary(date_str):
    """
    根据指定日期获取或生成每日总结。
    """
    print(f"Request received for summary of date: {date_str}")
    
    summary_data = get_or_generate_summary_for_date(date_str)
    
    if summary_data:
        return jsonify(summary_data)
    else:
        return jsonify({"message": f"日期 {date_str} 没有错题记录，无法生成总结。"}), 404
    
# in app.py

@app.route('/regenerate-summary/<string:date_str>', methods=['POST'])
def regenerate_summary(date_str):
    """
    强制重新生成指定日期的总结，并更新数据库。
    【已修复】增加了 try...except 块以处理内部错误。
    """
    print(f"Received FORCE regeneration request for date: {date_str}")
    
    try:
        # 1. 获取当天的所有错题
        questions_for_date = database.get_questions_by_date(date_str)
        if not questions_for_date:
            return jsonify({"error": f"日期 {date_str} 没有错题记录，无法重新生成总结。"}), 404

        # 2. 强制调用 AI 生成新总结
        print(f"Found {len(questions_for_date)} questions. Forcing AI regeneration...")
        summary_text_list = [q['problem_analysis'] for q in questions_for_date]
        subjects_list = [q['subject'] for q in questions_for_date]
        
        ai_summary_content = core.generate_daily_summary_with_ai("\n".join(summary_text_list))
        
        if 'error' in ai_summary_content:
            # 即使AI返回错误，我们也将其视为一种“成功”的生成结果（生成了错误提示）
            # 所以我们继续流程，将其存入数据库
            print(f"AI generation failed with message: {ai_summary_content['error']}")

        # 3. 准备新的数据结构，并把当天的粗心错误计入统计
        subject_counts = Counter(subjects_list)
        careless_count = 0
        try:
            if hasattr(database, 'get_careless_count_by_date'):
                careless_count = int(database.get_careless_count_by_date(date_str) or 0)
        except Exception as e:
            print(f"Failed to get careless count for {date_str}: {e}")

        if careless_count and careless_count > 0:
            subject_counts['计算错误'] = subject_counts.get('计算错误', 0) + careless_count

        total_questions = len(questions_for_date) + (careless_count or 0)

        new_summary_data = {
            "date": date_str,
            "ai_summary": ai_summary_content,
            "question_count": total_questions,
            "subject_chart_data": {
                "labels": list(subject_counts.keys()),
                "data": list(subject_counts.values())
            }
        }
        
        # 4. 使用新函数更新或保存到数据库
        database.update_or_add_summary(new_summary_data)
        
        # 5. 将新生成的总结返回给前端
        return jsonify(new_summary_data)

    except Exception as e:
        # 【关键修复】捕获任何未预料的错误（比如数据库连接失败）
        print(f"An unexpected error occurred in /regenerate-summary: {e}")
        return jsonify({"error": "服务器内部发生未知错误，请稍后再试。"}), 500


@app.route('/upload-careless-mistake', methods=['POST'])
def upload_careless_mistake():
    """处理粗心错误上传的API端点。"""
    print("Received a careless mistake upload request...")
    try:
        file = request.files.get('question_image')
        # 从富文本编辑器获取的内容是HTML格式
        user_reflection = request.form.get('user_reflection')

        if not file or file.filename == '' or not user_reflection:
            return jsonify({'status': 'failed', 'message': '必须上传图片并填写反思内容！'}), 400

        image_bytes = file.read()
        image_b64 = base64.b64encode(image_bytes).decode('utf-8')
        
        mistake_data = {
            "upload_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "original_image_b64": image_b64,
            "user_reflection": user_reflection
        }

        database.add_careless_mistake(mistake_data)
        
        print("Careless mistake processed and saved successfully.")
        return jsonify({'status': 'success', 'message': '粗心错误记录成功！'})

    except Exception as e:
        print(f"An unexpected error occurred in /upload-careless-mistake: {e}")
        return jsonify({'status': 'failed', 'message': f'服务器内部错误: {e}'}), 500


@app.route('/get-careless-mistakes')
def get_careless_mistakes():
    """提供分页粗心错误数据的API端点。"""
    try:
        page = request.args.get('page', 1, type=int)
        limit = 5 # 每次加载5条
        offset = (page - 1) * limit
        
        raw_mistakes = database.get_careless_mistakes(limit, offset)
        
        # 将数据库行对象转换为字典列表
        mistakes_list = [dict(row) for row in raw_mistakes]
            
        return jsonify(mistakes_list)
    except Exception as e:
        print(f"Error in /get-careless-mistakes: {e}")
        return jsonify({"error": "Internal server error"}), 500

@app.route('/update-careless-mistake/<int:mistake_id>', methods=['POST'])
def update_careless_mistake(mistake_id):
    """处理更新粗心错误反思的API端点。"""
    try:
        new_reflection = request.form.get('user_reflection')
        if new_reflection is None:
            return jsonify({'status': 'failed', 'message': '缺少反思内容'}), 400
        
        database.update_careless_mistake(mistake_id, new_reflection)
        
        # 返回更新后的内容，方便前端直接渲染
        return jsonify({
            'status': 'success', 
            'message': '反思已更新', 
            'new_reflection': new_reflection
        })
    except Exception as e:
        print(f"Error updating careless mistake {mistake_id}: {e}")
        return jsonify({'status': 'failed', 'message': f'更新失败: {e}'}), 500


@app.route('/delete-careless-mistake/<int:mistake_id>', methods=['DELETE'])
def delete_careless_mistake(mistake_id):
    """处理删除粗心错误的API端点。"""
    try:
        database.delete_careless_mistake(mistake_id)
        return jsonify({'status': 'success', 'message': '记录已删除'}), 200
    except Exception as e:
        print(f"Error deleting careless mistake {mistake_id}: {e}")
        return jsonify({'status': 'failed', 'message': f'删除失败: {e}'}), 500


@app.route('/chat/<int:question_id>')
def chat_page(question_id):
    """渲染独立的聊天页面。"""
    print(f"Loading chat page for question ID: {question_id}")
    question_data = database.get_question_by_id(question_id)
    if not question_data:
        return "Question not found", 404
    
    # 将数据库行对象转换为可序列化的字典
    q_dict = dict(question_data)
    try:
        # 反序列化JSON字符串字段以便在模板中使用
        q_dict['knowledge_points'] = json.loads(q_dict['knowledge_points'])
        q_dict['ai_analysis'] = json.loads(q_dict['ai_analysis'])
        q_dict['similar_examples'] = json.loads(q_dict['similar_examples'])
    except (json.JSONDecodeError, TypeError):
        # 如果解析失败，提供默认空值
        q_dict['knowledge_points'], q_dict['ai_analysis'], q_dict['similar_examples'] = [], [], []

    # 根据 User-Agent 简单判断移动端或桌面端，分别渲染不同模板以改善移动体验
    ua = request.headers.get('User-Agent', '') or ''
    ua_lower = ua.lower()
    is_mobile = False
    try:
        # 常见移动端标识
        if 'mobile' in ua_lower or 'android' in ua_lower or 'iphone' in ua_lower or 'ipad' in ua_lower:
            is_mobile = True
    except Exception:
        is_mobile = False

    if is_mobile:
        return render_template('chat_mobile.html', question=q_dict)
    else:
        return render_template('chat_desktop.html', question=q_dict)


@app.route('/chat-stream', methods=['POST'])
def chat_stream():
    """处理流式聊天请求的API端点。"""
    data = request.get_json()
    messages = data.get('messages', [])

    if not messages:
        return Response("No messages provided", status=400)

    def generate():
        # 使用 stream_with_context 确保在流式传输期间应用上下文是可用的
        yield from core.chat_with_ai_stream(messages)

    # 使用 text/event-stream 类型，这是服务器发送事件(SSE)的标准
    return Response(stream_with_context(generate()), mimetype='text/event-stream')


def get_or_generate_summary_for_date(date_str):
    """
    一个可复用的辅助函数，用于获取或生成指定日期的总结。
    返回一个包含总结数据的字典，或在没有数据时返回 None。
    """
    # 1. 尝试从数据库读取（若存在则直接返回，saved_summary 中可能已包含粗心错误统计）
    saved_summary = database.get_summary_by_date(date_str)
    if saved_summary:
        print(f"Found saved summary for {date_str} in database.")
        return {
            "date": saved_summary['summary_date'],
            "ai_summary": {
                "general_summary": saved_summary['general_summary'],
                "knowledge_points_summary": json.loads(saved_summary['knowledge_points_summary'])
            },
            "question_count": saved_summary['question_count'],
            "subject_chart_data": json.loads(saved_summary['subject_chart_data'])
        }

    # 2. 如果没有，则尝试生成
    questions_for_date = database.get_questions_by_date(date_str)
    if not questions_for_date:
        print(f"No questions found for {date_str}. Cannot generate summary.")
        return None

    # 3. 如果当天有错题，则生成、保存并返回
    print(f"Found {len(questions_for_date)} questions for {date_str}. Generating new summary...")
    summary_text_list = [q['problem_analysis'] for q in questions_for_date]
    subjects_list = [q['subject'] for q in questions_for_date]
    
    ai_summary_content = core.generate_daily_summary_with_ai("\n".join(summary_text_list))
    subject_counts = Counter(subjects_list)

    # 统计当天的粗心错误数量（如果表中有该函数）
    careless_count = 0
    try:
        if hasattr(database, 'get_careless_count_by_date'):
            careless_count = int(database.get_careless_count_by_date(date_str) or 0)
    except Exception as e:
        print(f"Failed to get careless count for {date_str}: {e}")

    # 如果存在粗心错误，则把它作为单独一类加入科目分布（标签为“计算错误”），并计入总数
    if careless_count and careless_count > 0:
        subject_counts['计算错误'] = subject_counts.get('计算错误', 0) + careless_count

    total_questions = len(questions_for_date) + (careless_count or 0)

    daily_summary = {
        "date": date_str,
        "ai_summary": ai_summary_content,
        "question_count": total_questions,
        "subject_chart_data": {
            "labels": list(subject_counts.keys()),
            "data": list(subject_counts.values())
        }
    }
    
    if 'error' not in ai_summary_content:
        # database.add_daily_summary(daily_summary)
        database.update_or_add_summary(daily_summary)
    
    return daily_summary

# 【新增】获取搜索筛选器数据的API
@app.route('/get-search-filters')
def api_get_search_filters():
    try:
        filters = database.get_search_filters()
        return jsonify(filters)
    except Exception as e:
        print(f"Error in /get-search-filters: {e}")
        return jsonify({"error": "Internal server error"}), 500

# 【新增】处理搜索请求的API
@app.route('/search', methods=['POST'])
def search():
    try:
        query_text = request.form.get('query', '')
        filters_json = request.form.get('filters', '{}')
        filters = json.loads(filters_json)
        image_file = request.files.get('image')
        
        image_keywords = ""
        if image_file:
            print("Image file detected in search request.")
            image_bytes = image_file.read()
            image_b64 = base64.b64encode(image_bytes).decode('utf-8')
            
            # 调用 core 函数为图片生成关键词
            result = core.generate_keywords_for_image(image_b64)
            if 'error' in result:
                return jsonify({"error": f"AI keyword generation failed: {result['error']}"}), 500
            image_keywords = result.get('keywords', '')
            print(f"Generated keywords from image: {image_keywords}")

        # 调用数据库搜索函数
        results = database.search_questions(query_text, filters, image_keywords)
        
        # 将结果中的JSON字符串字段转换为Python对象
        for item in results:
            try:
                item['knowledge_points'] = json.loads(item['knowledge_points'])
                item['ai_analysis'] = json.loads(item['ai_analysis'])
                item['similar_examples'] = json.loads(item['similar_examples'])
            except (json.JSONDecodeError, TypeError):
                continue # 忽略解析失败的字段

        return jsonify(results)

    except Exception as e:
        print(f"An unexpected error occurred in /search: {e}")
        return jsonify({"error": "Internal server error"}), 500

# --- 4. 启动应用 ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

