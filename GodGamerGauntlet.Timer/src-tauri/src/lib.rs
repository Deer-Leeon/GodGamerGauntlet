use reqwest::Method;

#[tauri::command]
async fn ledger_request(
    base: String,
    method: String,
    path: String,
    body: Option<String>,
    token: Option<String>,
) -> Result<String, String> {
    let url = format!(
        "{}{}",
        base.trim_end_matches('/'),
        if path.starts_with('/') {
            path
        } else {
            format!("/{path}")
        }
    );

    let client = reqwest::Client::builder()
        .user_agent("GGG-Timer/0.1 (godgamergauntlet.com)")
        .build()
        .map_err(|err| err.to_string())?;

    let verb = Method::from_bytes(method.as_bytes()).unwrap_or(Method::GET);
    let mut request = client.request(verb, &url).header("Accept", "application/json");

    if let Some(token) = token.filter(|value| !value.is_empty()) {
        request = request.bearer_auth(token);
    }
    if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }

    let response = request.send().await.map_err(|err| err.to_string())?;
    let status = response.status();
    let text = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(if text.is_empty() {
            format!("HTTP {}", status.as_u16())
        } else {
            text
        });
    }
    Ok(text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![ledger_request])
        .run(tauri::generate_context!())
        .expect("error while running GGG Timer");
}
