mod commands;
mod error;
mod path_env;

use commands::{
    check_app_update, check_claude, check_claude_latest, delete_file,
    discover_mcp_tools, ensure_claude_dir, fetch_text, list_agents,
    list_commands, list_mcp_servers, pick_folder, pty_close, pty_open,
    pty_resize, pty_write, read_project_summary, read_settings_file,
    read_text_file, read_tool_hints, rename_file, settings_file_path,
    write_settings_file, write_text_file,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // GUI 실행(Dock/Finder) 시 launchd가 주는 빈약한 PATH를 사용자 셸 PATH로 교체.
    // 이후 spawn되는 모든 자식 프로세스가 같은 PATH를 상속한다.
    path_env::fix_path_env();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            read_project_summary,
            ensure_claude_dir,
            read_text_file,
            write_text_file,
            delete_file,
            rename_file,
            list_agents,
            list_commands,
            fetch_text,
            pty_open,
            pty_write,
            pty_resize,
            pty_close,
            read_tool_hints,
            list_mcp_servers,
            discover_mcp_tools,
            check_claude,
            check_claude_latest,
            check_app_update,
            read_settings_file,
            write_settings_file,
            settings_file_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
