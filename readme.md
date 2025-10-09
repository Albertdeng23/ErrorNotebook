# 智能错题本 (AI-Powered Wrong Answer Book)

这是一个基于Python Flask和AI视觉模型的智能错题本Web应用。用户可以上传错题图片，应用将调用AI进行智能分析，并以结构化的方式存储和展示错题，帮助用户高效地复习和掌握知识点。

 
*(建议您运行应用后截一张图替换此链接)*

## ✨ 主要功能

- **📸 图片上传**: 用户可以方便地上传本地的错题图片。
- **🧠 AI智能分析**:
    - 自动识别题目内容。
    - 生成详细的**题目解析**、**考点分析**和**可能的错误**。
    - 举一反三，提供**相似例题**进行练习。
- **📊 学习分析与总结**:
    - **每日总结**: 次日自动生成前一天的学习总结报告，包括学习总纲和核心知识点。
    - **数据可视化**:
        - 以折线图展示近7日的新增错题趋势。
        - 以条形图展示每日错题的科目分布。
- **🚀 高性能浏览**:
    - **动态加载**: 点击科目后才加载数据，提升首页打开速度。
    - **无限滚动**: 向下滚动时自动加载更多错题，实现流畅的浏览体验。
- ** interactive 操作**:
    - **时间线导航**: 快速跳转到指定日期的错题。
    - **悬浮工具栏**: 对每条错题可进行**重新生成解析**、**复制解析**、**删除**等操作。
- **📁 结构化管理**:
    - 按科目自动分类。
    - 按日期自动归档。

## 🛠️ 技术栈

- **后端**:
    - **框架**: Flask
    - **AI集成**: `openai` Python库 (兼容各类OpenAI API的服务)
    - **数据库**: SQLite
    - **Markdown解析**: `markdown-it-py`
    - **环境变量**: `python-dotenv`
- **前端**:
    - **语言**: HTML, CSS, JavaScript (原生)
    - **图表**: Chart.js
- **开发环境**: Python 3.8+

## 🚀 快速开始

请按照以下步骤在您的本地环境中设置并运行本项目。

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/WrongAnswerBook.git
cd WrongAnswerBook
```

### 2. 创建并激活虚拟环境

- **Windows**:
  ```bash
  python -m venv venv
  .\venv\Scripts\activate
  ```
- **macOS / Linux**:
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```

### 3. 安装依赖

项目所需的所有Python库都记录在 `requirements.txt` 文件中。

```bash
pip install -r requirements.txt
```
*(如果项目中没有 `requirements.txt` 文件，请手动创建并添加以下内容)*
```txt
Flask
python-dotenv
openai
markdown-it-py
```

### 4. 配置环境变量

在项目根目录下创建一个名为 `.env` 的文件。这是存放您API密钥等敏感信息的关键文件。

复制以下内容到 `.env` 文件中，并替换为您自己的信息：

```ini
# .env
AI_MODEL='your_model_name' # 例如: gemini-2.5-flash-preview-05-20 或 gpt-4-vision-preview
API_URL="your_api_base_url" # 例如: https://api.openai.com/v1 或您的代理URL
API_KEY="sk-your_api_key_here" # 您的API密钥
```

**重要**: `.env` 文件已被添加到 `.gitignore` 中，以防止您的密钥被意外上传到代码仓库。

### 5. 运行应用

一切准备就绪后，运行主程序：

```bash
python app.py
```

应用启动后，您会在终端看到类似以下的输出：
```
 * Serving Flask app 'app'
 * Debug mode: on
Database initialized and 'questions' table is ready.
 * Running on http://127.0.0.1:5000
Press CTRL+C to quit
```

现在，在您的浏览器中打开 **http://127.0.0.1:5000** 即可开始使用！

## 📁 项目结构

```
WrongAnswerBook/
├── app.py                # Flask主程序：处理路由、Web服务和业务逻辑
├── core.py               # 核心模块：负责调用AI API进行分析和总结
├── database.py           # 数据库模块：负责所有数据库的增删改查操作
├── static/                 # 静态文件
│   ├── css/
│   │   └── style.css     # 全局CSS样式
│   └── js/
│       └── main.js       # 前端JavaScript交互逻辑
├── templates/              # HTML模板
│   └── index.html        # 应用主页面
├── .env                    # 环境变量文件 (需手动创建)
├── requirements.txt        # Python依赖列表
└── database.db             # SQLite数据库文件 (首次运行时自动创建)
```

## 💡 未来可扩展功能

- [ ] **用户认证系统**: 支持多用户使用。
- [ ] **在线编辑**: 实现“修改解析”功能，允许用户手动更正或补充AI的分析。
- [ ] **全文搜索**: 快速在所有错题中搜索关键词。
- [ ] **导出功能**: 将指定科目或日期的错题导出为PDF或Markdown文件。
- [ ] **错题复习提醒**: 根据艾宾浩斯遗忘曲线，智能推送需要复习的错题。

---
```
