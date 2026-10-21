//! RedCode IM 2.0 —— PC 端设计稿的 GPUI 复刻
//!
//! 设计源：`~/code/redcode-im/im-ui-html` 的 `#/pc-design` 路由
//! （纯 HTML + CSS + JS）。本程序用 Rust + GPUI 复刻同一套布局与设计 token。
//!
//! 全部为内存 mock：会话、消息、成员、共享文件均为静态样例，不接任何真实 API。

mod data;
mod theme;

use gpui::prelude::*;
use gpui::{
    div, px, rgb, size, uniform_list, Application, Bounds, Context, FontWeight, Rgba, Window,
    WindowBounds, WindowOptions,
};

use data::{CONVERSATIONS, MEMBERS, MESSAGES, SHARED_FILES};
use theme::{Palette, *};

// ── 应用状态 ────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum Nav {
    Chats,
    Contacts,
    Mine,
}

#[derive(Clone, Copy, PartialEq)]
enum Filter {
    All,
    Unread,
    Groups,
}

struct Seladb {
    nav: Nav,
    filter: Filter,
    selected: usize,
    /// 自己发出的追加消息（发送按钮 mock）
    sent: Vec<String>,
    inspector_open: bool,
    dark: bool,
}

impl Seladb {
    fn new() -> Self {
        Self {
            nav: Nav::Chats,
            filter: Filter::All,
            selected: 0,
            sent: Vec::new(),
            inspector_open: true,
            dark: false,
        }
    }

    fn palette(&self) -> Palette {
        if self.dark {
            Palette::dark()
        } else {
            Palette::light()
        }
    }

    /// 当前筛选下的会话（mock 过滤）
    fn visible_convos(&self) -> Vec<usize> {
        CONVERSATIONS
            .iter()
            .enumerate()
            .filter(|(_, c)| match self.filter {
                Filter::All => true,
                Filter::Unread => c.unread > 0,
                Filter::Groups => c.is_group,
            })
            .map(|(i, _)| i)
            .collect()
    }
}

// ── 绘制辅助 ────────────────────────────────────────────────

/// 统一圆角
fn radius(d: gpui::Div, r: f32) -> gpui::Div {
    let mut d = d;
    let v: gpui::AbsoluteLength = px(r).into();
    d.style().corner_radii.top_left = Some(v);
    d.style().corner_radii.top_right = Some(v);
    d.style().corner_radii.bottom_right = Some(v);
    d.style().corner_radii.bottom_left = Some(v);
    d
}

/// 四角分别指定（消息气泡的「尾巴」角）
fn radius4(d: gpui::Div, tl: f32, tr: f32, br: f32, bl: f32) -> gpui::Div {
    let mut d = d;
    d.style().corner_radii.top_left = Some(px(tl).into());
    d.style().corner_radii.top_right = Some(px(tr).into());
    d.style().corner_radii.bottom_right = Some(px(br).into());
    d.style().corner_radii.bottom_left = Some(px(bl).into());
    d
}

fn txt(s: impl Into<String>, color: Rgba, size: f32) -> gpui::Div {
    div()
        .text_size(px(size))
        .text_color(color)
        .child(s.into())
}

/// 圆角方块头像
fn avatar(initials: &str, side: f32, p: &Palette) -> gpui::Div {
    radius(
        div()
            .size(px(side))
            .flex_none()
            .flex()
            .items_center()
            .justify_center()
            .bg(p.accent)
            .text_size(px(side * 0.34))
            .font_weight(FontWeight::SEMIBOLD)
            .text_color(p.on_accent)
            .child(initials.to_string()),
        R_AVATAR,
    )
}

/// 未读徽标
fn badge(count: u32, p: &Palette) -> gpui::Div {
    if count == 0 {
        return div();
    }
    radius(
        div()
            .min_w(px(16.))
            .h(px(16.))
            .px_1()
            .flex()
            .items_center()
            .justify_center()
            .bg(p.badge)
            .text_size(px(FS_TINY))
            .text_color(rgb(0xFFFFFF))
            .child(count.to_string()),
        8.0,
    )
}

// ── 图标（用 div 组合，避免引入 SVG 资产）──────────────────

fn icon_bubble(p: &Palette, active: bool) -> gpui::Div {
    let c = if active { p.accent } else { p.text_secondary };
    radius(
        div()
            .w(px(17.))
            .h(px(13.))
            .flex_none()
            .bg(c),
        4.0,
    )
}

fn icon_people(p: &Palette, active: bool) -> gpui::Div {
    let c = if active { p.accent } else { p.text_secondary };
    div()
        .w(px(19.))
        .flex_none()
        .flex()
        .flex_col()
        .items_center()
        .gap_1()
        .child(
            radius(
                div().w(px(8.)).h(px(8.)).flex_none().bg(c),
                4.0,
            ),
        )
        .child(
            radius(
                div().w(px(15.)).h(px(8.)).flex_none().bg(c),
                4.0,
            ),
        )
}

fn icon_person(p: &Palette, active: bool) -> gpui::Div {
    let c = if active { p.accent } else { p.text_secondary };
    div()
        .w(px(19.))
        .flex_none()
        .flex()
        .flex_col()
        .items_center()
        .gap_1()
        .child(radius(div().w(px(9.)).h(px(9.)).flex_none().bg(c), 4.5))
        .child(radius(div().w(px(14.)).h(px(7.)).flex_none().bg(c), 3.5))
}

fn icon_menu(p: &Palette) -> gpui::Div {
    div()
        .w(px(16.))
        .flex_none()
        .flex()
        .flex_col()
        .items_center()
        .gap_1()
        .children([0, 1, 2].map(|_| {
            radius(div().w(px(14.)).h(px(1.5)).flex_none().bg(p.text_secondary), 1.0)
        }))
}

fn icon_search(p: &Palette) -> gpui::Div {
    div()
        .w(px(15.))
        .h(px(15.))
        .flex_none()
        .relative()
        .child(
            div()
                .w(px(11.))
                .h(px(11.))
                .rounded_full()
                .border_1()
                .border_color(p.text_tertiary),
        )
}

fn icon_more(p: &Palette) -> gpui::Div {
    div()
        .w(px(16.))
        .flex_none()
        .flex()
        .items_center()
        .gap_1()
        .children([0, 1, 2].map(|_| {
            div().w(px(3.)).h(px(3.)).rounded_full().bg(p.text_secondary)
        }))
}

fn tool_icon(kind: usize, p: &Palette) -> gpui::Div {
    let c = p.text_secondary;
    match kind {
        0 => radius(div().w(px(9.)).h(px(13.)).flex_none().bg(c), 4.5),
        1 => radius(div().w(px(10.)).h(px(14.)).flex_none().bg(c), 2.0),
        2 => div()
            .w(px(14.))
            .h(px(11.))
            .flex_none()
            .relative()
            .rounded_sm()
            .border_1()
            .border_color(c)
            .child(
                div()
                    .absolute()
                    .left(px(2.))
                    .bottom(px(2.))
                    .w(px(6.))
                    .h(px(5.))
                    .rounded_sm()
                    .bg(c),
            ),
        _ => radius(div().w(px(9.)).h(px(13.)).flex_none().bg(c), 2.0),
    }
}

// ── 左侧导航轨 ──────────────────────────────────────────────

fn nav_rail(app: &Seladb, p: &Palette, cx: &mut Context<Seladb>) -> impl IntoElement {
    let item = |kind: Nav,
                id: &'static str,
                label: &'static str,
                icon: gpui::Div,
                badge: u32,
                cx: &mut Context<Seladb>| {
        let active = app.nav == kind;
        let color = if active { p.accent } else { p.text_secondary };
        div()
            .id(id)
            .w(px(48.))
            .h(px(48.))
            .relative()
            .flex()
            .items_center()
            .justify_center()
            .flex_col()
            .gap_1()
            .child(icon)
            .child(txt(label, color, 10.0))
            .child(
                div()
                    .absolute()
                    .top_0()
                    .right_0()
                    .child(badge_count(badge, p)),
            )
            .on_click(cx.listener(move |this, _, _, _| {
                this.nav = kind;
            }))
    };

    div()
        .w(px(NAV_W))
        .flex_none()
        .h_full()
        .flex()
        .flex_col()
        .items_center()
        .gap_4()
        .py_4()
        .px_2()
        .bg(p.nav_bg)
        .border_r_1()
        .border_color(p.nav_line)
        .child(
            // 品牌 R
            radius(
                div()
                    .size(px(42.))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_center()
                    .bg(rgb(0x111111))
                    .text_size(px(22.))
                    .font_weight(FontWeight::BOLD)
                    .text_color(rgb(0xFFFFFF))
                    .child("R"),
                12.0,
            ),
        )
        .child(item(
            Nav::Chats,
            "nav-chats",
            "聊天",
            icon_bubble(p, app.nav == Nav::Chats),
            20,
            cx,
        ))
        .child(item(
            Nav::Contacts,
            "nav-contacts",
            "联系人",
            icon_people(p, app.nav == Nav::Contacts),
            6,
            cx,
        ))
        .child(item(
            Nav::Mine,
            "nav-mine",
            "我的",
            icon_person(p, app.nav == Nav::Mine),
            0,
            cx,
        ))
        .child(div().flex_1())
        .child(icon_menu(p))
}

fn badge_count(count: u32, p: &Palette) -> gpui::Div {
    if count == 0 {
        return div();
    }
    radius(
        div()
            .min_w(px(16.))
            .h(px(16.))
            .flex()
            .items_center()
            .justify_center()
            .bg(p.badge)
            .text_size(px(FS_TINY))
            .text_color(rgb(0xFFFFFF))
            .child(count.to_string()),
        8.0,
    )
}

// ── 会话列表面板 ───────────────────────────────────────────

fn conversation_list(app: &Seladb, p: &Palette, cx: &mut Context<Seladb>) -> impl IntoElement {
    let visible = app.visible_convos();
    let selected = app.selected;
    let count = visible.len();

    let header = div()
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .mb_3()
        .child(
            div()
                .flex()
                .flex_col()
                .child(txt("消息", p.text, FS_TITLE))
                .child(txt(
                    format!("{} 个会话", count),
                    p.text_dim,
                    FS_CAPTION,
                )),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap_2()
                .child(icon_search(p))
                .child(txt("＋", p.text_secondary, FS_HEADING)),
        );

    let search = div()
        .h(px(SEARCH_H))
        .w_full()
        .flex()
        .flex_row()
        .items_center()
        .gap_2()
        .px_3()
        .rounded_sm()
        .bg(p.field)
        .child(icon_search(p))
        .child(txt("搜索会话", p.text_tertiary, FS_SUMMARY));

    let filters = div()
        .flex()
        .flex_row()
        .items_center()
        .gap_1()
        .my_3()
        .child(
            div()
                .id("filter-all")
                .h(px(CHIP_H))
                .px_3()
                .flex()
                .items_center()
                .rounded_md()
                .bg(p.accent)
                .text_size(px(FS_SUMMARY))
                .text_color(p.on_accent)
                .child("全部")
                .on_click(cx.listener(|this, _, _, _| this.filter = Filter::All)),
        )
        .child(
            div()
                .id("filter-unread")
                .h(px(CHIP_H))
                .px_3()
                .flex()
                .items_center()
                .rounded_md()
                .text_size(px(FS_SUMMARY))
                .text_color(p.text_secondary)
                .child("未读")
                .child(div().ml_1().child("6"))
                .on_click(cx.listener(|this, _, _, _| this.filter = Filter::Unread)),
        )
        .child(
            div()
                .id("filter-groups")
                .h(px(CHIP_H))
                .px_3()
                .flex()
                .items_center()
                .rounded_md()
                .text_size(px(FS_SUMMARY))
                .text_color(p.text_secondary)
                .child("群聊")
                .on_click(cx.listener(|this, _, _, _| this.filter = Filter::Groups)),
        );

    let list = uniform_list(
        "convos",
        count,
        cx.processor(move |this, range: std::ops::Range<usize>, _w, cx| {
            let p = this.palette();
            range
                .map(|i| {
                    let idx = visible[i];
                    let c = &CONVERSATIONS[idx];
                    let active = idx == selected;
                    div()
                            .h(px(CONVO_H))
                            .w_full()
                            .px_3()
                            .py_3()
                            .flex()
                            .flex_row()
                            .items_center()
                            .gap_3()
                            .bg(if active {
                                p.item_active
                            } else {
                                gpui::Rgba::default()
                            })
                            .child(avatar(c.initials, AVATAR, &p))
                            .child(
                                div()
                                    .flex_1()
                                    .min_w_0()
                                    .flex()
                                    .flex_col()
                                    .gap_1()
                                    .child(
                                        div()
                                            .flex()
                                            .flex_row()
                                            .items_center()
                                            .justify_between()
                                            .gap_2()
                                            .child(
                                                div()
                                                    .flex()
                                                    .flex_row()
                                                    .items_center()
                                                    .gap_1()
                                                    .child(txt(
                                                        c.name,
                                                        p.text,
                                                        FS_NAME,
                                                    ))
                                                    .child(if c.pinned {
                                                        txt("⚑", p.text_tertiary, FS_TINY)
                                                    } else {
                                                        div()
                                                    }),
                                            )
                                            .child(txt(c.time, p.text_tertiary, FS_TINY)),
                                    )
                                    .child(
                                        div()
                                            .flex()
                                            .flex_row()
                                            .items_center()
                                            .gap_2()
                                            .child(
                                                div()
                                                    .flex_1()
                                                    .min_w_0()
                                                    .text_size(px(FS_SUMMARY))
                                                    .text_color(p.text_secondary)
                                                    .child(c.snippet.to_string()),
                                            )
                                            .child(badge(c.unread, &p)),
                                    ),
                            )
                            .id(gpui::SharedString::from(format!("convo-{idx}")))
                            .on_click(cx.listener(move |this, _, _, _| {
                                this.selected = idx;
                            }))
                })
                .collect::<Vec<_>>()
        }),
    )
    .flex_1()
    .min_h_0()
    .w_full();

    div()
        .w(px(LIST_W))
        .flex_none()
        .h_full()
        .flex()
        .flex_col()
        .px_3()
        .py_5()
        .bg(p.list_bg)
        .border_r_1()
        .border_color(p.panel_line)
        .child(header)
        .child(search)
        .child(filters)
        .child(list)
}

// ── 聊天面板 ────────────────────────────────────────────────

fn chat_pane(app: &Seladb, p: &Palette, cx: &mut Context<Seladb>) -> impl IntoElement {
    let convo = &CONVERSATIONS[app.selected];
    let members = convo.members;

    let header = div()
        .h(px(CHAT_HEADER_H))
        .flex_none()
        .px_6()
        .py_4()
        .flex()
        .flex_row()
        .items_center()
        .justify_between()
        .border_b_1()
        .border_color(p.chat_header_line)
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap_3()
                .child(avatar(convo.initials, AVATAR, p))
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_1()
                        .child(txt(convo.name, p.text, FS_HEADING))
                        .child(txt(
                            if members > 0 {
                                format!("{} 位成员", members)
                            } else {
                                "私聊".to_string()
                            },
                            p.text_dim,
                            FS_CAPTION,
                        )),
                ),
        )
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .gap_3()
                .child(icon_search(p))
                .child(icon_more(p)),
        );

    // 消息区：uniform_list 等高槽位
    let total = MESSAGES.len() + app.sent.len();
    let sent = app.sent.clone();
    let messages = uniform_list(
        "messages",
        total,
        cx.processor(move |this, range: std::ops::Range<usize>, _, _| {
            let p = this.palette();
            range
                .map(|i| {
                    let (author, initials, text, time, self_sent) = if i < MESSAGES.len() {
                        let m = &MESSAGES[i];
                        (m.author, m.initials, m.text, m.time, m.self_sent)
                    } else {
                        let t = &sent[i - MESSAGES.len()];
                        ("我", "ME", t.as_str(), "刚刚", true)
                    };

                    let bubble = if self_sent {
                        radius4(
                            div()
                                .w_full()
                                .max_w(px(560.))
                                .min_w_0()
                                .px_4()
                                .py_3()
                                .bg(p.accent)
                                .text_size(px(FS_BODY))
                                .text_color(p.on_accent)
                                .child(text.to_string()),
                            R_BUBBLE,
                            R_BUBBLE,
                            R_BUBBLE_TAIL,
                            R_BUBBLE,
                        )
                    } else {
                        radius4(
                            div()
                                .w_full()
                                .max_w(px(560.))
                                .min_w_0()
                                .px_4()
                                .py_3()
                                .bg(p.app_bg)
                                .text_size(px(FS_BODY))
                                .text_color(p.text_body)
                                .child(text.to_string()),
                            R_BUBBLE,
                            R_BUBBLE,
                            R_BUBBLE,
                            R_BUBBLE_TAIL,
                        )
                    };

                    let row = div()
                        .w_full()
                        .max_w(px(960.))
                        .min_w_0()
                        .mx_auto()
                        .h(px(MSG_SLOT_H))
                        .flex()
                        .flex_row()
                        .items_start()
                        .gap_2();

                    if self_sent {
                        row.justify_end().child(bubble)
                    } else {
                        row.child(avatar(initials, AVATAR_SM, &p))
                            .child(
                                div()
                                    .flex()
                                    .flex_col()
                                    .gap_1()
                                    .child(txt(author, p.text_secondary, FS_TINY))
                                    .child(bubble)
                                    .child(txt(time, p.text_tertiary, FS_TINY)),
                            )
                    }
                })
                .collect::<Vec<_>>()
        }),
    )
    .flex_1()
    .min_h_0()
    .w_full();

    // 输入区
    let composer = radius(
        div()
            .w_full()
            .max_w(px(960.))
            .mx_auto()
            .mt_3()
            .mb_4()
            .px_3()
            .py_2()
            .bg(p.app_bg)
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .gap_1()
                    .children([0usize, 1, 2, 3].map(|k| {
                        div()
                            .w(px(26.))
                            .h(px(26.))
                            .flex()
                            .items_center()
                            .justify_center()
                            .rounded_sm()
                            .child(tool_icon(k, &p))
                    })),
            )
            .child(txt("输入消息", p.text_tertiary, FS_BODY))
            .child(
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .justify_between()
                    .mt_2()
                    .child(txt(
                        "Enter 发送 · Shift + Enter 换行",
                        p.text_tertiary,
                        FS_TINY,
                    ))
                    .child(
                        radius(
                            div()
                                .h(px(32.))
                                .px_4()
                                .flex()
                                .items_center()
                                .bg(p.accent)
                                .text_size(px(FS_SUMMARY))
                                .text_color(p.on_accent)
                                .child("发送"),
                            R_ITEM,
                        )
                        .id("send")
                        .on_click(cx.listener(|this, _, _, _| {
                            this.sent.push("已发送一条 mock 消息".to_string());
                        })),
                    ),
            ),
        R_COMPOSER,
    );

    div()
        .flex_1()
        .min_w(px(464.))
        .flex()
        .flex_col()
        .bg(p.chat_bg)
        .child(header)
        .child(
            div()
                .flex_1()
                .min_h_0()
                .flex()
                .flex_col()
                .bg(p.chat_surface)
                .child(messages)
                .child(composer),
        )
}

// ── 会话详情面板 ────────────────────────────────────────────

fn inspector(app: &Seladb, p: &Palette, cx: &mut Context<Seladb>) -> impl IntoElement {
    let convo = &CONVERSATIONS[app.selected];

    let profile = radius(
        div()
            .w_full()
            .px_3()
            .py_5()
            .flex()
            .flex_col()
            .items_center()
            .gap_2()
            .bg(p.card)
            .child(avatar(convo.initials, 56.0, p))
            .child(txt(convo.name, p.text, FS_HEADING))
            .child(txt(
                if convo.members > 0 {
                    format!("{} 位成员", convo.members)
                } else {
                    "私聊".to_string()
                },
                p.text_secondary,
                FS_SUMMARY,
            )),
        R_INFO_CARD,
    );

    let section = |title: &str, action: &str, p: &Palette, body: gpui::Div| {
        div()
            .flex()
            .flex_col()
            .gap_2()
            .child(
                div()
                    .flex()
                    .flex_row()
                    .items_center()
                    .justify_between()
                    .child(txt(title, p.text, FS_SUMMARY))
                    .child(txt(action, p.text_tertiary, FS_TINY)),
            )
            .child(body)
    };

    let members = div()
        .flex()
        .flex_row()
        .gap_2()
        .children(MEMBERS.iter().map(|m| {
            div()
                .size(px(28.))
                .rounded_full()
                .flex()
                .items_center()
                .justify_center()
                .bg(p.accent)
                .text_size(px(10.))
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(p.on_accent)
                .child(m.initials.to_string())
        }));

    let files = div()
        .flex()
        .flex_col()
        .gap_2()
        .children(SHARED_FILES.iter().map(|f| {
            div()
                .w_full()
                .flex()
                .flex_row()
                .items_center()
                .gap_3()
                .px_3()
                .py_2()
                .rounded_sm()
                .bg(p.card)
                .child(
                    radius(
                        div()
                            .w(px(14.))
                            .h(px(16.))
                            .flex_none()
                            .bg(p.text_secondary),
                        2.0,
                    ),
                )
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .child(txt(f.name, p.text, FS_SUMMARY))
                        .child(txt(f.kind, p.text_secondary, FS_TINY)),
                )
        }));

    div()
        .w(px(INSPECTOR_W))
        .flex_none()
        .h_full()
        .flex()
        .flex_col()
        .gap_4()
        .px_3()
        .py_5()
        .bg(p.inspector_bg)
        .border_l_1()
        .border_color(p.panel_line)
        .child(
            div()
                .flex()
                .flex_row()
                .items_center()
                .justify_between()
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .child(txt("会话详情", p.text, FS_HEADING))
                        .child(txt("资料、成员与共享内容", p.text_dim, FS_CAPTION)),
                )
                .child(
                    div()
                        .id("close-inspector")
                        .w(px(26.))
                        .h(px(26.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .rounded_sm()
                        .child(txt("✕", p.text_secondary, FS_CAPTION))
                        .on_click(cx.listener(|this, _, _, _| this.inspector_open = false)),
                ),
        )
        .child(profile)
        .child(section(
            "群聊信息",
            "群详情",
            p,
            div()
                .flex()
                .flex_col()
                .gap_3()
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_1()
                        .child(txt("我的身份：群主", p.text, FS_SUMMARY))
                        .child(members),
                )
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .gap_1()
                        .child(txt("群公告", p.text, FS_SUMMARY))
                        .child(txt("暂未发布群公告", p.text_secondary, FS_TINY)),
                ),
        ))
        .child(section("共享文件", "查看全部", p, files))
}

// ── 根渲染 ──────────────────────────────────────────────────

impl Render for Seladb {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Seladb>) -> impl IntoElement {
        let p = self.palette();
        // 4 列最小宽度：72(导航) + 296(列表) + 464(聊天) + 288(详情) = 1120
        // 低于此宽度时详情栏收起（对应设计稿的 is-inspector-closed）
        let w = f32::from(_window.viewport_size().width);
        const MIN_4COL: f32 = 1120.0;
        let show_inspector = self.inspector_open && w >= MIN_4COL;

        let body = match self.nav {
            Nav::Chats => div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_row()
                .child(nav_rail(self, &p, cx))
                .child(conversation_list(self, &p, cx))
                .child(chat_pane(self, &p, cx))
                .child(if show_inspector {
                    inspector(self, &p, cx).into_any_element()
                } else {
                    div().into_any_element()
                }),
            Nav::Contacts => div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_row()
                .child(nav_rail(self, &p, cx))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .items_center()
                        .justify_center()
                        .bg(p.list_bg)
                        .child(txt("联系人目录（mock 占位）", p.text_secondary, FS_HEADING)),
                ),
            Nav::Mine => div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_row()
                .child(nav_rail(self, &p, cx))
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .items_center()
                        .justify_center()
                        .bg(p.list_bg)
                        .child(txt("我的资料（mock 占位）", p.text_secondary, FS_HEADING)),
                ),
        };

        // 产品工作台直接铺满窗口 —— 设计源里的画布边框与预览工作栏属于
        // 设计工具本身，不是 RedCode 的产品界面。
        div()
            .size_full()
            .flex()
            .flex_row()
            .overflow_hidden()
            .bg(p.app_bg)
            .child(body)
    }
}

// ── 启动 ────────────────────────────────────────────────────

fn main() {
    Application::new().run(|cx: &mut gpui::App| {
        let bounds = Bounds::centered(None, size(px(1440.), px(900.)), cx);
        cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |_window, cx| cx.new(|_cx| Seladb::new()),
        )
        .unwrap();
    });
}
