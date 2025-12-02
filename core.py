import os
import base64
import json
from datetime import datetime
from dotenv import load_dotenv
from openai import OpenAI
import httpx
# 加载 .env 文件中的环境变量
load_dotenv()

# --- 1. 从环境变量中获取API配置 ---
# 从.env文件中读取API密钥、基础URL和模型名称
# 这种方式可以避免将敏感信息硬编码在代码中
API_KEY = os.getenv("API_KEY")
API_URL = os.getenv("API_URL")
AI_MODEL = os.getenv("AI_MODEL")
PROXY_URL = os.getenv("PROXY_URL")
# --- 2. 初始化 OpenAI 客户端 ---
# 使用获取到的配置来初始化一个可以与API通信的客户端实例
# 注意：我们使用了 base_url 参数，使其可以与非官方OpenAI的兼容API端点通信
# --- 2. 初始化 OpenAI 客户端 (已更新为支持代理) ---
try:
    # 3. 如果配置了代理，则创建一个带代理的 httpx 客户端
    if PROXY_URL:
        print(f"Using proxy: {PROXY_URL}")
        proxies = {
            "http://": PROXY_URL,
            "https://": PROXY_URL,
        }
        http_client = httpx.Client(proxies=proxies)
    else:
        http_client = None

    # 4. 将 http_client 传递给 OpenAI 客户端
    client = OpenAI(
        api_key=API_KEY,
        base_url=API_URL,
        http_client=http_client  # <-- 关键改动
    )
    print("OpenAI client initialized successfully.")

except Exception as e:
    print(f"Error initializing OpenAI client: {e}")
    client = None

def encode_image_to_base64(image_bytes: bytes) -> str:
    """
    将图片文件的二进制数据编码为Base64字符串。
    
    Args:
        image_bytes: 图片的二进制内容。

    Returns:
        图片的Base64编码字符串。
    """
    return base64.b64encode(image_bytes).decode('utf-8')

def analyze_question_with_ai(image_base64: str, user_question: str = "") -> dict:
    """
    【已更新】调用AI模型分析错题图片，并一次性返回包括关键词在内的所有结构化解析结果。
    """
    if not client:
        return {"error": "AI client is not initialized."}

    prompt_text = """
    你是一个大学老师师，你善于用直观的方法的为学生解释问题。你会的知识包括但不限于高等数学、物理化学、材料分析测试方法、材料科学基础。你喜欢苏格რ底式启发式教育，你觉得这有利于学生理解问题。

你的做法：
首先给出结论，然后再慢慢启发式解释“为什么”是这样的结论。
对于题目，你会根据学生的错误选项揣测他可能犯的错误，然后给出解答，分析考点，然后出几道类似的题目.

你的任务是分析学生上传的错题图片。
    请仔细分析图片中的题目，并严格按照以下JSON格式返回你的分析结果，不要有任何多余的解释或前言。

    JSON格式要求如下：
    {
      "problem_analysis": "对题目的详细解析，包括解题步骤和思路。",
      "keywords": "格式为 [主要科目]-[知识面]-[关键词1, 关键词2, 关键词3] 的字符串，用于检索。",
      "knowledge_points": "一个字符串列表，列出这道题考察的核心知识点。",
      "possible_errors": "一个字符串列表，列出学生在做这道题时最容易犯的错误。",
      "similar_examples": [
        {
          "question": "这里是第一道相似例题的题干",
          "answer": "这里是第一道相似例题的详细解答"
        }
      ]
    }
    """

    if user_question:
        prompt_text += f"\n请特别注意，学生对这道题有以下疑问，请在你的分析中侧重解答：'{user_question}'"

    try:
        print("Sending request to AI API for full analysis...")
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_text},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            },
                        },
                    ],
                }
            ],
            response_format={"type": "json_object"},
            max_tokens=16384,
        )
        print("AI full analysis received.")
        
        ai_result_str = response.choices[0].message.content
        
        print("--- Raw AI Response Content ---")
        print(ai_result_str)
        print("-----------------------------")

        try:
            ai_result_json = json.loads(ai_result_str)
        except json.JSONDecodeError:
            error_message = f"AI返回的不是有效的JSON格式。原始响应内容: '{ai_result_str[:500]}...'"
            print(error_message)
            return {"error": error_message}
        
        # 【修改】返回包含新 keywords 字段的完整解析结果
        return {
            "problem_analysis": ai_result_json.get("problem_analysis", "AI未提供题目解析。"),
            "keywords": ai_result_json.get("keywords"), # 新增
            "knowledge_points": ai_result_json.get("knowledge_points", []),
            "possible_errors": ai_result_json.get("possible_errors", []),
            "similar_examples": ai_result_json.get("similar_examples", [])
        }

    except Exception as e:
        print(f"An error occurred during AI analysis: {e}")
        return {"error": str(e)}



def process_new_question(image_bytes: bytes, subject: str, user_question: str = "") -> dict:
    """
    【已更新】处理一个新的错题上传请求的完整流程，现在会包含关键词。
    """
    # 1. 将图片编码为Base64
    image_b64 = encode_image_to_base64(image_bytes)
    
    # 2. 调用AI进行分析 (新函数会返回包含关键词的结果)
    ai_analysis_result = analyze_question_with_ai(image_b64, user_question)

    if "error" in ai_analysis_result:
        return ai_analysis_result

    # 3. 组装最终的数据结构
    final_data = {
        "original_image_b64": image_b64,
        "subject": subject,
        "user_question": user_question,
        "upload_date": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "problem_analysis": ai_analysis_result.get("problem_analysis"),
        "keywords": ai_analysis_result.get("keywords"), # 【新增】将关键词添加到数据结构中
        "knowledge_points": json.dumps(ai_analysis_result.get("knowledge_points", []), ensure_ascii=False),
        "ai_analysis": json.dumps(ai_analysis_result.get("possible_errors", []), ensure_ascii=False),
        "similar_examples": json.dumps(ai_analysis_result.get("similar_examples", []), ensure_ascii=False)
    }
    
    return final_data

# 在 core.py 文件中

def generate_daily_summary_with_ai(yesterday_questions_text: str) -> dict:
    """
    调用AI模型对昨日学习内容进行总结。
    (增强了JSON解析的健壮性和回退机制)
    """
    if not client:
        return {"error": "AI client is not initialized."}

    prompt_text = f"""
    你是一位资深的私人学习导师。你的任务是根据学生昨日的错题记录，为他生成一份简洁、精炼、有洞察力的学习总结报告。

    这是学生昨日的全部错题解析和考点内容：
    ---
    {yesterday_questions_text}
    ---

    请严格按照以下JSON格式返回你的总结报告，不要添加任何额外的解释或文字包裹。你的回答必须是一个完整的、可以被直接解析的JSON对象。
    {{
      "general_summary": "在这里用2-3句话对昨日学习的整体内容进行一个高度概括的总结（总纲）。",
      "knowledge_points_summary": [
        "在这里列出昨日错题反映出的第一个核心知识点或薄弱环节。",
        "在这里列出第二个核心知识点或薄弱环节。",
        "在这里列出第三个核心知识点或薄弱环节。"
      ]
    }}
    """

    try:
        print("Sending request to AI API for daily summary...")
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt_text}],
            response_format={"type": "json_object"},
            max_tokens=2048,
        )
        print("AI daily summary received.")
        
        ai_result_str = response.choices[0].message.content
        
        # --- 新增：防御性解析逻辑 ---
        try:
            # 1. 尝试找到JSON对象的开始和结束位置
            start_index = ai_result_str.find('{')
            end_index = ai_result_str.rfind('}')
            
            if start_index != -1 and end_index != -1 and end_index > start_index:
                # 2. 提取可能的JSON字符串
                json_candidate_str = ai_result_str[start_index : end_index + 1]
                ai_result_json = json.loads(json_candidate_str)
                print("Successfully parsed extracted JSON.")
                
                # 成功解析，返回结构化数据
                return {
                    "general_summary": ai_result_json.get("general_summary", "AI未提供总纲。"),
                    "knowledge_points_summary": ai_result_json.get("knowledge_points_summary", ["AI未能总结知识点。"])
                }
            else:
                # 如果连 '{' 和 '}' 都找不到，直接进入降级处理
                raise ValueError("JSON object markers not found in the response.")

        except (json.JSONDecodeError, ValueError) as e:
            # 3. 如果解析失败，执行优雅降级
            print(f"JSON parsing failed: {e}. Falling back to unstructured summary.")
            # 返回一个非错误格式的字典，但内容是原始文本
            # 这样可以被存入数据库，避免重复调用
            return {
                "general_summary": f"[非结构化总结] {ai_result_str}",
                "knowledge_points_summary": ["AI返回的知识点无法按格式解析，请参考上方总纲。"]
            }
        # --- 防御性解析结束 ---

    except Exception as e:
        print(f"An error occurred during AI summary generation: {e}")
        return {"error": str(e)}

def chat_with_ai_stream(messages: list):
    """
    与AI进行流式聊天。

    Args:
        messages: 一个包含聊天历史的列表，遵循OpenAI API格式。

    Yields:
        AI响应的文本块 (chunks)。
    """
    if not client:
        yield '{"error": "AI client is not initialized."}'
        return

    try:
        # 确保AI知道它的角色
        system_prompt = {
            "role": "system",
            "content": """
            你是一个大学老师师，你善于用直观的方法的为学生解释问题。你会的知识包括但不限于高等数学、物理化学、材料分析测试方法、材料科学基础。你喜欢苏格რ底式启发式教育，你觉得这有利于学生理解问题。
            你的做法：
            首先给出结论，然后再慢慢启发式解释“为什么”是这样的结论。
            对于题目，你会根据学生的错误选项揣测他可能犯的错误，然后给出解答"""
        }
        
        # 将系统提示插入到消息列表的开头
        messages_with_system_prompt = [system_prompt] + messages

        print("Sending stream request to AI API...")
        response = client.chat.completions.create(
            model=AI_MODEL,
            messages=messages_with_system_prompt,
            stream=True,  # <-- 关键：开启流式响应
            max_tokens=4096
        )

        for chunk in response:
            content = chunk.choices[0].delta.content or ""
            if content:
                yield content

    except Exception as e:
        print(f"An error occurred during AI stream chat: {e}")
        yield f'{{"error": "与AI通信时发生错误: {str(e)}"}}'


# 【新增】为图片生成关键词
def generate_keywords_for_image(image_base64: str) -> dict:
    """
    调用AI模型分析错题图片，并返回结构化的关键词。
    """
    if not client:
        return {"error": "AI client is not initialized."}

    prompt_text = """
    你是一个信息检索专家。你的任务是分析用户上传的错题图片，提取最核心的关键词。
    请严格按照以下格式返回你的分析结果，不要有任何多余的解释或前言。

    格式要求: [主要科目]-[知识面]-[关键词1, 关键词2, 关键词3]

    例如，如果图片内容是关于电化学的，你的输出应该是：[物理化学]-[电化学]-[能斯特方程的应用, 平均离子活度, 吉布斯自由能]
    又例如，如果图片内容是关于微积分的，你的输出应该是：[高等数学]-[微积分]-[洛必达法则, 极限求解, 导数应用]
    """

    try:
        print("Sending request to AI API for image keyword generation...")
        response = client.chat.completions.create(
            model=AI_MODEL, # 使用 .env 中的模型
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt_text},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}"
                            },
                        },
                    ],
                }
            ],
            max_tokens=200,
            temperature=0.1,
        )
        print("AI response received for image keywords.")
        
        keywords = response.choices[0].message.content.strip()
        return {"keywords": keywords}

    except Exception as e:
        print(f"An error occurred during AI image keyword generation: {e}")
        return {"error": str(e)}


# --- 这是一个用于独立测试本模块功能的示例 ---
if __name__ == '__main__':
    # 使用方法：
    # 1. 确保你的项目根目录下有 .env 文件，并且内容正确。
    # 2. 在项目根目录下放一张名为 'test_problem.jpg' 的错题图片。
    # 3. 运行 `python core.py`
    
    try:
        with open("test_problem.jpg", "rb") as image_file:
            test_image_bytes = image_file.read()
            
            print("--- 开始测试错题处理流程 ---")
            my_doubt = "我不理解为什么辅助线要这么画。"
            subject = "数学"
            
            processed_data = process_new_question(
                image_bytes=test_image_bytes,
                subject=subject,
                user_question=my_doubt
            )
            
            if "error" in processed_data:
                print("\n处理失败:")
                print(processed_data["error"])
            else:
                print("\n--- 处理成功，生成的最终数据结构如下 ---")
                print(f"科目: {processed_data['subject']}")
                print(f"上传日期: {processed_data['upload_date']}")
                print(f"题目解析: {processed_data['problem_analysis']}")
                
                # 从JSON字符串转换回Python对象以便查看
                knowledge_points = json.loads(processed_data['knowledge_points'])
                possible_errors = json.loads(processed_data['ai_analysis'])
                similar_examples = json.loads(processed_data['similar_examples'])
                
                print(f"考点解析: {knowledge_points}")
                print(f"可能的错误: {possible_errors}")
                print("相似例题:")
                for i, ex in enumerate(similar_examples, 1):
                    print(f"  例题{i}: {ex['question']}")
                    print(f"  答案{i}: {ex['answer']}")
                
                # 为了简洁，不打印完整的base64字符串
                print(f"原图片 (Base64): {processed_data['original_image_b64'][:50]}...")

    except FileNotFoundError:
        print("\n测试失败：请在项目根目录下放置一张名为 'test_problem.jpg' 的图片。")
    except Exception as e:
        print(f"\n测试过程中发生未知错误: {e}")

