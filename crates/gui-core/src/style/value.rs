//! 样式值类型。
//!
//! 只保留框架真正支持的属性子集。**每个属性都必须能被映射到 taffy 布局
//! 或绘制指令**，否则不予支持 —— 这样「CSS 支持范围」是明确且可枚举的。

use std::fmt;

/// 长度值。`Auto` 表示由内容决定（对应 CSS 的 `auto`）。
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Length {
    Auto,
    Px(f32),
    Percent(f32),
}

impl Default for Length {
    fn default() -> Self {
        Length::Auto
    }
}

/// 颜色（sRGB，0..=1）。
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub const TRANSPARENT: Color = Color {
        r: 0.0,
        g: 0.0,
        b: 0.0,
        a: 0.0,
    };
    pub const BLACK: Color = Color {
        r: 0.0,
        g: 0.0,
        b: 0.0,
        a: 1.0,
    };
    pub const WHITE: Color = Color {
        r: 1.0,
        g: 1.0,
        b: 1.0,
        a: 1.0,
    };

    pub fn rgb(hex: u32) -> Self {
        Self {
            r: ((hex >> 16) & 0xff) as f32 / 255.0,
            g: ((hex >> 8) & 0xff) as f32 / 255.0,
            b: (hex & 0xff) as f32 / 255.0,
            a: 1.0,
        }
    }

    pub fn with_alpha(mut self, a: f32) -> Self {
        self.a = a;
        self
    }
}

impl fmt::Display for Color {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "rgba({:.0},{:.0},{:.0},{:.2})",
            self.r * 255.0,
            self.g * 255.0,
            self.b * 255.0,
            self.a
        )
    }
}

/// 盒模型的四边值。
#[derive(Clone, Copy, PartialEq, Debug, Default)]
pub struct EdgeSizes {
    pub top: f32,
    pub right: f32,
    pub bottom: f32,
    pub left: f32,
}

impl EdgeSizes {
    pub fn all(v: f32) -> Self {
        Self {
            top: v,
            right: v,
            bottom: v,
            left: v,
        }
    }
    pub fn uniform(&self) -> bool {
        (self.top - self.right).abs() < f32::EPSILON
            && (self.right - self.bottom).abs() < f32::EPSILON
            && (self.bottom - self.left).abs() < f32::EPSILON
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Display {
    Flex,
    Block,
    None,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FlexDirection {
    Row,
    Column,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FlexWrap {
    NoWrap,
    Wrap,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AlignItems {
    FlexStart,
    Center,
    FlexEnd,
    Stretch,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum JustifyContent {
    FlexStart,
    Center,
    FlexEnd,
    SpaceBetween,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Position {
    Relative,
    Absolute,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Overflow {
    Visible,
    Hidden,
    Scroll,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

/// 一个可参与级联的属性。
///
/// 未支持的属性在解析阶段被丢弃（并记录警告），不做静默失败。
#[derive(Clone, PartialEq, Debug)]
pub enum Property {
    Display(Display),
    FlexDirection(FlexDirection),
    FlexGrow(f32),
    FlexShrink(f32),
    FlexBasis(Length),
    FlexWrap(FlexWrap),
    AlignItems(AlignItems),
    JustifyContent(JustifyContent),
    Gap(f32),
    RowGap(f32),
    ColumnGap(f32),
    Width(Length),
    Height(Length),
    MinWidth(Length),
    MinHeight(Length),
    MaxWidth(Length),
    MaxHeight(Length),
    Padding(EdgeSizes),
    Margin(EdgeSizes),
    BorderWidth(f32),
    BorderColor(Color),
    BorderRadius(EdgeSizes),
    BackgroundColor(Color),
    Color(Color),
    FontSize(f32),
    FontWeight(u16),
    LineHeight(f32),
    TextAlign(TextAlign),
    Position(Position),
    Overflow(Overflow),
    ZIndex(i32),
}

impl Property {
    /// 属性名（用于调试与错误信息）。
    pub fn name(&self) -> &'static str {
        use Property::*;
        match self {
            Display(_) => "display",
            FlexDirection(_) => "flex-direction",
            FlexGrow(_) => "flex-grow",
            FlexShrink(_) => "flex-shrink",
            FlexBasis(_) => "flex-basis",
            FlexWrap(_) => "flex-wrap",
            AlignItems(_) => "align-items",
            JustifyContent(_) => "justify-content",
            Gap(_) => "gap",
            RowGap(_) => "row-gap",
            ColumnGap(_) => "column-gap",
            Width(_) => "width",
            Height(_) => "height",
            MinWidth(_) => "min-width",
            MinHeight(_) => "min-height",
            MaxWidth(_) => "max-width",
            MaxHeight(_) => "max-height",
            Padding(_) => "padding",
            Margin(_) => "margin",
            BorderWidth(_) => "border-width",
            BorderColor(_) => "border-color",
            BorderRadius(_) => "border-radius",
            BackgroundColor(_) => "background-color",
            Color(_) => "color",
            FontSize(_) => "font-size",
            FontWeight(_) => "font-weight",
            LineHeight(_) => "line-height",
            TextAlign(_) => "text-align",
            Position(_) => "position",
            Overflow(_) => "overflow",
            ZIndex(_) => "z-index",
        }
    }

    /// 该属性是否从父元素继承。
    ///
    /// 对齐 CSS 规范：`color` / `font-*` / `text-align` / `line-height` 继承，
    /// 盒模型与布局属性不继承。
    pub fn is_inherited(&self) -> bool {
        use Property::*;
        matches!(
            self,
            Color(_) | FontSize(_) | FontWeight(_) | LineHeight(_) | TextAlign(_)
        )
    }
}

/// 一条声明：属性 + 值 + 来源。
#[derive(Clone, PartialEq, Debug)]
pub struct Declaration {
    pub property: Property,
    /// 声明在样式表中的顺序，用于同优先级时的先后决胜。
    pub order: usize,
}
