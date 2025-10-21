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
    (已简化，不再处理每日总结，只渲染页面框架)
    """
    print("Loading main page shell...")
    
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


# in app.py
@app.route('/get-summary/<string:date_str>')
def get_summary(date_str):
    """
    根据指定日期获取或生成每日总结。
    """
    print(f"Request received for summary of date: {date_str}")
    
    # 1. 尝试从数据库读取该日期的总结
    saved_summary = database.get_summary_by_date(date_str)
    if saved_summary:
        print(f"Found saved summary for {date_str} in database.")
        daily_summary = {
            "date": saved_summary['summary_date'],
            "ai_summary": {
                "general_summary": saved_summary['general_summary'],
                "knowledge_points_summary": json.loads(saved_summary['knowledge_points_summary'])
            },
            "question_count": saved_summary['question_count'],
            "subject_chart_data": json.loads(saved_summary['subject_chart_data'])
        }
        return jsonify(daily_summary)

    # 2. 如果数据库中没有，则尝试生成
    print(f"No saved summary for {date_str}. Trying to generate one...")
    questions_for_date = database.get_questions_by_date(date_str)
    
    if not questions_for_date:
        print(f"No questions found for {date_str}. Cannot generate summary.")
        return jsonify({"message": f"日期 {date_str} 没有错题记录，无法生成总结。"}), 404

    # 3. 如果当天有错题，则生成、保存并返回总结
    print(f"Found {len(questions_for_date)} questions for {date_str}. Generating new summary...")
    summary_text_list = [q['problem_analysis'] for q in questions_for_date]
    subjects_list = [q['subject'] for q in questions_for_date]
    
    ai_summary_content = core.generate_daily_summary_with_ai("\n".join(summary_text_list))
    subject_counts = Counter(subjects_list)
    
    daily_summary = {
        "date": date_str,
        "ai_summary": ai_summary_content,
        "question_count": len(questions_for_date),
        "subject_chart_data": {
            "labels": list(subject_counts.keys()),
            "data": list(subject_counts.values())
        }
    }
    
    if 'error' not in ai_summary_content:
        database.add_daily_summary(daily_summary)
    
    return jsonify(daily_summary)

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

    return render_template('chat.html', question=q_dict)


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


# --- 4. 启动应用 ---
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)

