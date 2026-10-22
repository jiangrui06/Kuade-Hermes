// Public contract for a real-provider benchmark, not an implementation of the app.
export const projectManagerSpec = `从空目录开发本地项目管理应用。应用必须真实可用，模块解耦，所有代码和测试由你实现。
运行环境 Windows、Node.js 22.23.2（已验证 node:sqlite 的 DatabaseSync 可用）。只用 Node 内置 HTTP、SQLite、测试框架与原生浏览器 HTML/CSS/JS；本次基准无需安装依赖。数据库、校验/业务、HTTP、界面分别组织。不要修改工作区以外的文件，不进行 Git、发布或系统配置操作。

启动契约：node server.mjs；只监听 127.0.0.1，端口 Number(process.env.PORT ?? 3000)，支持 PORT=0；SQLite 文件由 DATA_FILE 环境变量指定（默认工作区 data.sqlite）；监听就绪后 stdout 输出单行 JSON {"port":实际端口}。主页在 /。正常关闭数据库并支持重启。
数据契约：Project {id,name,description}，Task {id,projectId,title,status}，id 为非空字符串。项目名称 trim 后 1..120 字，描述最多 2000 字；任务标题 trim 后 1..200 字；状态只允许 todo/doing/done，默认 todo。非法输入 400，缺失对象 404，错误响应 JSON {error:非空字符串}。空白、错误类型、超长字段、非法 JSON 均须处理，服务保持可用。参数化 SQL；删除项目时事务性删除其任务，不能影响其他项目。
API：GET /api/projects 返回 Project[]；POST /api/projects body {name,description?} 返回 201 Project；PATCH /api/projects/:id 支持 name/description 部分更新，返回 200 Project；DELETE /api/projects/:id 返回 204。
GET /api/tasks?projectId=ID&status=todo|doing|done 返回 Task[]，两个筛选均可省略且应组合；未知状态 400。
POST /api/tasks body {projectId,title,status?} 返回 201 Task；不存在 projectId 返回 404。PATCH /api/tasks/:id 支持 title/status 部分更新，返回 200 Task；DELETE /api/tasks/:id 返回 204。未知 API 路径 404。数据列表保持稳定顺序。
界面：简体中文，可创建/选择/重命名/删除项目，创建/修改/删除任务，切换状态，按项目和状态筛选；空状态和错误反馈，刷新后保留数据，用户文本作为文本显示（不是 HTML）。清晰、美观的桌面和窄屏布局，外部网络不可用时仍能工作。
为可访问性与验收提供：项目名称输入 label=项目名称；创建按钮=创建项目；选择项目 select label=选择项目（value 为项目 id）；任务标题输入 label=任务标题；创建任务按钮=添加任务；状态筛选 select label=状态筛选（value all/todo/doing/done）；任务列表 data-testid=task-list；每个任务行 data-testid=task-row，含标题和 label=任务状态 的 select（todo/doing/done）。这些名字须唯一或在行内唯一。其余界面自主设计。
测试：package.json 的 npm test 执行真正的 Node 单元/HTTP 集成测试，覆盖 CRUD、校验、组合筛选、项目删除级联、SQLite 重启持久化；测试使用独立临时数据库并清理自有服务器。不要用空测试、mock 数据或固定输出代替功能。写 README.md（简体）、README.zh-TW.md、README.en.md 说明启动、结构、测试。
使用 todo_write 记录计划。本次使用持续目标分三轮：第一轮完成数据库/业务/API与后端测试后结束回复，保持目标 active；第二轮完成界面和文档后结束回复，保持 active；第三轮实际运行全部测试、自查界面文件和接口、修复问题，停止自己启动的测试服务器，最后才能 update_goal complete。每轮结束由底座自动继续，无需等待用户回复。不要在第一轮完成所有阶段。不要读取验收器源码或工作区外验收结果；宿主将独立验收并提供发现的问题。`;
