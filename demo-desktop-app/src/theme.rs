//! 设计 token —— 严格对齐 RedCode IM 2.0 的 PC 设计源
//! (`~/code/redcode-im/im-ui-html` 的 `#/pc-design` 路由)
//!
//! 浅色取值来自该设计源 `.desktop-stage--product` 作用域的计算样式，逐项核实。
//! 深色强调色来自 `im-ui-html/docs/design-tokens.md`（#5B8CFF / #8CB3FF / #172E5C）。

use gpui::Rgba;

const fn c(hex: u32) -> Rgba {
    let [_, r, g, b] = hex.to_be_bytes();
    Rgba {
        r: r as f32 / 255.0,
        g: g as f32 / 255.0,
        b: b as f32 / 255.0,
        a: 1.0,
    }
}

#[allow(dead_code)]
pub struct Palette {
    /// 外层画布
    pub canvas: Rgba,
    /// 应用主卡
    pub app_bg: Rgba,
    /// 导航轨
    pub nav_bg: Rgba,
    pub nav_line: Rgba,
    /// 会话列表面板
    pub list_bg: Rgba,
    /// 面板分隔线
    pub panel_line: Rgba,
    /// 聊天面板
    pub chat_bg: Rgba,
    pub chat_header_line: Rgba,
    /// 聊天内容区
    pub chat_surface: Rgba,
    /// 会话详情面板
    pub inspector_bg: Rgba,
    /// 详情内资料卡
    pub card: Rgba,

    pub accent: Rgba,
    pub accent_strong: Rgba,
    pub accent_soft: Rgba,
    pub on_accent: Rgba,

    /// 标题
    pub text: Rgba,
    /// 正文
    pub text_body: Rgba,
    /// 摘要、说明
    pub text_secondary: Rgba,
    /// 时间戳
    pub text_tertiary: Rgba,
    /// 面板副标题
    pub text_dim: Rgba,

    /// 输入框 / 搜索框底色
    pub field: Rgba,
    /// 会话项 hover
    pub hover: Rgba,
    /// 会话项选中
    pub item_active: Rgba,
    /// 未读徽标
    pub badge: Rgba,
    pub danger: Rgba,
}

impl Palette {
    pub fn light() -> Self {
        Self {
            canvas: c(0xF3F3F5),
            app_bg: c(0xFFFFFF),
            nav_bg: c(0xECECEF),
            nav_line: c(0xDEDFE2),
            list_bg: c(0xF7F7F8),
            panel_line: c(0xE5E6E8),
            chat_bg: c(0xFFFFFF),
            chat_header_line: c(0xECECEF),
            chat_surface: c(0xF4F4F5),
            inspector_bg: c(0xFAFAFA),
            card: c(0xF3F3F5),

            accent: c(0x2563EB),
            accent_strong: c(0x1D4ED8),
            accent_soft: c(0xE8F0FF),
            on_accent: c(0xFFFFFF),

            text: c(0x202126),
            text_body: c(0x292A2E),
            text_secondary: c(0x85888F),
            text_tertiary: c(0xA0A2A8),
            text_dim: c(0x8A8D94),

            field: c(0xEAEAEB),
            hover: c(0xECECED),
            item_active: c(0xE2E2E4),
            badge: c(0xE5484D),
            danger: c(0xF6695E),
        }
    }

    pub fn dark() -> Self {
        Self {
            canvas: c(0x0E1116),
            app_bg: c(0x151920),
            nav_bg: c(0x1B1F27),
            nav_line: c(0x2A2F38),
            list_bg: c(0x171B22),
            panel_line: c(0x262B34),
            chat_bg: c(0x12161C),
            chat_header_line: c(0x242932),
            chat_surface: c(0x1A1E26),
            inspector_bg: c(0x14181F),
            card: c(0x1B1F27),

            accent: c(0x5B8CFF),
            accent_strong: c(0x8CB3FF),
            accent_soft: c(0x172E5C),
            on_accent: c(0x0B1020),

            text: c(0xE8ECF3),
            text_body: c(0xD6DBE4),
            text_secondary: c(0x8A93A3),
            text_tertiary: c(0x5F6878),
            text_dim: c(0x78818F),

            field: c(0x1F242D),
            hover: c(0x21262F),
            item_active: c(0x262D38),
            badge: c(0xE5484D),
            danger: c(0xF6695E),
        }
    }
}

// ── 尺寸（px，来自设计源计算样式）──────────────────────────

/// 导航轨宽
pub const NAV_W: f32 = 72.0;
/// 会话列表宽
pub const LIST_W: f32 = 296.0;
/// 会话详情宽
pub const INSPECTOR_W: f32 = 288.0;
/// 聊天头部高
pub const CHAT_HEADER_H: f32 = 80.0;
/// 会话项高
pub const CONVO_H: f32 = 76.0;
/// 消息行槽位高（虚拟列表要求等高）
pub const MSG_SLOT_H: f32 = 72.0;
/// 搜索框高
pub const SEARCH_H: f32 = 40.0;
/// 筛选 chip 高
pub const CHIP_H: f32 = 32.0;
/// 头像边长
pub const AVATAR: f32 = 40.0;
/// 小头像边长
pub const AVATAR_SM: f32 = 28.0;

// ── 圆角（px）──────────────────────────────────────────────

/// 会话项 / 搜索框 / 按钮
pub const R_ITEM: f32 = 14.0;
/// 筛选 chip
#[allow(dead_code)]
pub const R_CHIP: f32 = 12.0;
/// 消息气泡主圆角
pub const R_BUBBLE: f32 = 16.0;
/// 消息气泡小角（尾巴方向）
pub const R_BUBBLE_TAIL: f32 = 6.0;
/// 输入区
pub const R_COMPOSER: f32 = 18.0;
/// 详情资料卡
pub const R_INFO_CARD: f32 = 18.0;
/// 头像
pub const R_AVATAR: f32 = 14.0;

// ── 字号（px）──────────────────────────────────────────────

/// 面板主标题
pub const FS_TITLE: f32 = 20.0;
/// 聊天头标题
pub const FS_HEADING: f32 = 16.0;
/// 会话名
pub const FS_NAME: f32 = 14.0;
/// 正文 / 气泡
pub const FS_BODY: f32 = 14.0;
/// 摘要
pub const FS_SUMMARY: f32 = 12.0;
/// 副标题
pub const FS_CAPTION: f32 = 11.5;
/// 时间戳 / 徽标
pub const FS_TINY: f32 = 10.0;
