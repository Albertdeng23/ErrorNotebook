import time
import os
from openai import OpenAI
import database # 导入我们自己的数据库模块

# --- AI 配置 ---
# 强烈建议：未来将这些值放入 .env 文件中，并使用 load_dotenv() 加载
# 这里为了方便根据你的要求直接写出
API_KEY = "sk-7e7d8308bc9a4a2780242426b859e68d" 
API_URL = "https://api.deepseek.com/v1"
AI_MODEL = 'deepseek-chat'

# --- 初始化 AI 客户端 ---
try:
    client = OpenAI(api_key=API_KEY, base_url=API_URL)
    print("DeepSeek AI client initialized successfully.")
except Exception as e:
    print(f"Error initializing AI client: {e}")
    client = None

def generate_keywords_for_text(analysis_text: str) -> str | None:
    """
    调用 AI 模型为给定的文本生成结构化的关键词。

    Args:
        analysis_text: 错题的 AI 解析文本。

    Returns:
        一个结构化的关键词字符串，或者在失败时返回 None。
    """
    if not client:
        print("AI client is not available.")
        return None
    
    if not analysis_text or not analysis_text.strip():
        print("Input text is empty, skipping AI call.")
        return None

    prompt = f"""
    你是一个信息检索专家。你的任务是根据下面提供的错题解析文本，提取出最核心的关键词。
    请严格按照以下格式输出，不要有任何多余的解释、前言或结尾。

    格式要求: [主要科目]-[知识面]-[关键词1, 关键词2, 关键词3]

    例如，如果文本是关于电化学的，你的输出应该是：[物理化学]-[电化学]-[能斯特方程的应用, 平均离子活度, 吉布斯自由能]
    又例如，如果文本是关于微积分的，你的输出应该是：[高等数学]-[微积分]-[洛必达法则, 极限求解, 导数应用]

    现在，请为以下文本生成关键词：
    ---
    {analysis_text}
    ---
    """

    try:
        print("Sending request to AI for keyword generation...")
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {"role": "system", "content": "你是一个信息检索专家，严格按照指定格式输出。"},
                {"role": "user", "content": prompt}
            ],
            max_tokens=100,
            temperature=0.1, # 使用较低的温度以获得更稳定、格式更一致的输出
        )
        
        keywords = response.choices[0].message.content.strip()
        
        # 简单的格式验证
        if keywords.startswith('[') and ']-[' in keywords and keywords.endswith(']'):
            return keywords
        else:
            print(f"Warning: AI returned keywords in an unexpected format: {keywords}")
            # 即使格式不对，也可能有用，我们先返回它
            return keywords

    except Exception as e:
        print(f"An error occurred during AI keyword generation: {e}")
        return None

def main():
    """
    主执行函数。
    """
    print("--- Starting Keyword Generation Script ---")
    
    # 确保数据库表结构是最新的
    database.init_db()
    database.migrate_db()

    # 1. 从数据库获取所有需要处理的错题
    questions_to_process = database.get_all_questions_for_keyword_generation()
    
    if not questions_to_process:
        print("All questions already have keywords. No work to do. Exiting.")
        return

    total_questions = len(questions_to_process)
    print(f"Found {total_questions} questions that need keywords.")

    # 2. 遍历每条错题并处理
    for i, question in enumerate(questions_to_process):
        question_id = question['id']
        analysis_text = question['problem_analysis']

        
        print(f"\n--- Processing question {i+1}/{total_questions} (ID: {question_id}) ---")
        
        # 3. 为解析文本生成关键词
        generated_keywords = generate_keywords_for_text(analysis_text)
        
        # 4. 如果成功生成，则更新数据库
        if generated_keywords:
            print(f"Successfully generated keywords: {generated_keywords}")
            try:
                database.update_question_keywords(question_id, generated_keywords)
            except Exception as e:
                print(f"Error updating database for question ID {question_id}: {e}")
        else:
            print(f"Failed to generate keywords for question ID {question_id}. Skipping.")
            
        # 5. 礼貌地等待一下，避免触发 API 的速率限制
        time.sleep(1) 

    print("\n--- Keyword Generation Script Finished ---")


if __name__ == '__main__':
    main()
