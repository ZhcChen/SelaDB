//! Mock 数据 —— 对齐 RedCode IM 2.0 PC 设计源里的会话与消息样例。
//! 全部为内存 mock，不接任何真实 API。

pub struct Conversation {
    pub name: &'static str,
    pub initials: &'static str,
    pub time: &'static str,
    pub snippet: &'static str,
    pub unread: u32,
    pub pinned: bool,
    pub is_group: bool,
    pub members: u32,
}

pub const CONVERSATIONS: &[Conversation] = &[
    Conversation {
        name: "Launch War Room",
        initials: "LW",
        time: "11:18",
        snippet: "本周发布清单已更新，风险项…",
        unread: 3,
        pinned: true,
        is_group: true,
        members: 18,
    },
    Conversation {
        name: "Chloe Gu",
        initials: "CG",
        time: "09:06",
        snippet: "长姓名和长岗位在窄屏下显…",
        unread: 2,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Alice Li",
        initials: "AL",
        time: "昨天",
        snippet: "[语音]",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Zane Liu",
        initials: "ZL",
        time: "08:11",
        snippet: "联调结果和负责人我会更新到项目…",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Media Vault",
        initials: "MV",
        time: "昨天",
        snippet: "好的，整理完成后我共享目录链…",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Ava Zhao",
        initials: "AZ",
        time: "09:34",
        snippet: "把用户访谈里的搜索反馈归到…",
        unread: 4,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Jules",
        initials: "J",
        time: "10:53",
        snippet: "客服培训排在周三下午，会议邀请已经发出。",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Design Review",
        initials: "DR",
        time: "周一",
        snippet: "新一版的空态和加载态已经切到主干。",
        unread: 1,
        pinned: false,
        is_group: true,
        members: 7,
    },
    Conversation {
        name: "Nina Patel",
        initials: "NP",
        time: "周一",
        snippet: "指标口径我按上周的版本对齐了。",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Ops Bridge",
        initials: "OB",
        time: "上周",
        snippet: "值班表已更新，节假日按轮换执行。",
        unread: 0,
        pinned: false,
        is_group: true,
        members: 12,
    },
    Conversation {
        name: "Kevin Sun",
        initials: "KS",
        time: "上周",
        snippet: "收到，我这边下午给到初步结论。",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "Release Bot",
        initials: "RB",
        time: "上周",
        snippet: "构建 #2048 成功，产物已上传。",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
    Conversation {
        name: "数据周报群",
        initials: "数",
        time: "上周",
        snippet: "本周新增 1.2 万条，环比 +8%。",
        unread: 5,
        pinned: false,
        is_group: true,
        members: 9,
    },
    Conversation {
        name: "Mia Chen",
        initials: "MC",
        time: "更早",
        snippet: "文档链接放在共享文件里了。",
        unread: 0,
        pinned: false,
        is_group: false,
        members: 0,
    },
];

pub struct Message {
    pub author: &'static str,
    pub initials: &'static str,
    pub text: &'static str,
    pub time: &'static str,
    pub self_sent: bool,
}

pub const MESSAGES: &[Message] = &[
    Message {
        author: "Launch War Room",
        initials: "LW",
        text: "消息搜索结果要能直接回到原会话，并保留前后的讨论内容。",
        time: "10:53",
        self_sent: false,
    },
    Message {
        author: "我",
        initials: "ME",
        text: "我会补充上线后的观察指标，关注送达率、搜索使用率和活跃联动情况。",
        time: "11:01",
        self_sent: true,
    },
    Message {
        author: "Jules",
        initials: "J",
        text: "客服培训排在周三下午，会议邀请已经发出。",
        time: "11:12",
        self_sent: false,
    },
    Message {
        author: "我",
        initials: "ME",
        text: "本周发布清单已更新，风险项和责任人都标好了。",
        time: "11:18",
        self_sent: true,
    },
    Message {
        author: "Kevin Sun",
        initials: "KS",
        text: "数据侧的埋点已经补齐，明天上午可以看第一版数据。",
        time: "11:26",
        self_sent: false,
    },
    Message {
        author: "我",
        initials: "ME",
        text: "好的，辛苦了。有异常随时同步。",
        time: "11:30",
        self_sent: true,
    },
    Message {
        author: "Ava Zhao",
        initials: "AZ",
        text: "搜索反馈已归类到三个方向，本周会给出优先级建议。",
        time: "11:41",
        self_sent: false,
    },
    Message {
        author: "Nina Patel",
        initials: "NP",
        text: "口径和上周保持一致，附在共享文件里了。",
        time: "11:47",
        self_sent: false,
    },
];

pub struct Member {
    pub initials: &'static str,
}

pub const MEMBERS: &[Member] = &[
    Member { initials: "CA" },
    Member { initials: "ZW" },
    Member { initials: "IC" },
    Member { initials: "MS" },
    Member { initials: "JH" },
];

pub struct SharedFile {
    pub name: &'static str,
    pub kind: &'static str,
}

pub const SHARED_FILES: &[SharedFile] = &[
    SharedFile {
        name: "发布计划.md",
        kind: "产品规划",
    },
    SharedFile {
        name: "release-checklist.md",
        kind: "协作文档",
    },
];
