mod help_bar;
mod layout;
mod list;
mod logo;
mod subtitle;

pub use layout::centered_rect;
pub use logo::{LogoSize, ELECTRIC_PURPLE};

// Re-export render functions with descriptive names
pub use help_bar::render as render_help_bar;
pub use list::render as render_list;
pub use logo::render as render_logo;
pub use subtitle::render as render_subtitle;
