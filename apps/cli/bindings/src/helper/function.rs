use anyhow::{Context, Result};
use convex::{ConvexClient, FunctionResult, Value};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub trait FunctionArg
where
    Self: Serialize,
{
    fn to_args(&self) -> Result<BTreeMap<String, Value>> {
        let json_value =
            serde_json::to_value(self).context("Failed to serialize function arguments")?;

        let mut args = BTreeMap::new();
        if let serde_json::Value::Object(map) = json_value {
            for (key, value) in map {
                let convex_value =
                    Value::try_from(value).context("Failed to convert argument to Convex value")?;
                args.insert(key, convex_value);
            }
        }

        Ok(args)
    }
}

impl FunctionArg for () {}

fn from_convex_value<T>(value: Value) -> Result<T>
where
    T: serde::de::DeserializeOwned,
{
    let json_value = value.export();

    let result: T =
        serde_json::from_value(json_value).context("Failed to deserialize Convex response")?;

    Ok(result)
}

pub fn deserialize_number_from_float<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_u64() {
                Ok(i)
            } else if let Some(f) = n.as_f64() {
                Ok(f as u64)
            } else {
                Err(serde::de::Error::custom("invalid number"))
            }
        }
        _ => Err(serde::de::Error::custom("expected number")),
    }
}

pub fn deserialize_optional_number_from_float<'de, D>(
    deserializer: D,
) -> Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Null => Ok(None),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_u64() {
                Ok(Some(i))
            } else if let Some(f) = n.as_f64() {
                Ok(Some(f as u64))
            } else {
                Err(serde::de::Error::custom("invalid number"))
            }
        }
        _ => Err(serde::de::Error::custom("expected number or null")),
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FunctionError {
    pub code: String,
    pub message: String,
    pub severity: ErrorSeverity,
}

impl FunctionError {
    pub fn is_code(&self, code: &str) -> bool {
        self.code == code || self.message.contains(code)
    }

    pub fn matches_any(&self, codes: &[&str]) -> bool {
        codes.iter().any(|code| self.is_code(code))
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ErrorSeverity {
    High,
    Medium,
    Low,
}

impl std::fmt::Display for FunctionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "[{}] {}: {}",
            match self.severity {
                ErrorSeverity::High => "HIGH",
                ErrorSeverity::Medium => "MEDIUM",
                ErrorSeverity::Low => "LOW",
            },
            self.code,
            self.message
        )
    }
}

impl std::error::Error for FunctionError {}

fn parse_function_error(error: &convex::ConvexError) -> FunctionError {
    let error_str = format!("{:?}", error);

    if let Some(start) = error_str.find('{')
        && let Some(end) = error_str[start..].rfind('}')
    {
        let mut json_str = error_str[start..start + end + 1].to_string();

        json_str = json_str.replace(r#"\""#, r#"""#);
        json_str = json_str.replace(r#"\n"#, "\n");
        json_str = json_str.replace(r#"\t"#, "\t");
        json_str = json_str.replace(r#"\\"#, r#"\"#);

        #[derive(Deserialize)]
        struct TempError {
            code: Option<String>,
            message: String,
            severity: Option<ErrorSeverity>,
        }

        if let Ok(temp_error) = serde_json::from_str::<TempError>(&json_str) {
            return FunctionError {
                code: temp_error.code.unwrap_or_else(|| "UNKNOWN".to_string()),
                message: temp_error.message,
                severity: temp_error.severity.unwrap_or(ErrorSeverity::Medium),
            };
        }
    }

    FunctionError {
        code: "SERVER_ERROR".to_string(),
        message: error_str,
        severity: ErrorSeverity::High,
    }
}

#[cfg(not(test))]
pub async fn query<T, K>(client: &mut ConvexClient, function_name: &str, arg: T) -> Result<K>
where
    T: FunctionArg,
    K: DeserializeOwned,
{
    let args = arg.to_args()?;
    let result = client
        .query(function_name, args)
        .await
        .context("Failed to execute Convex query")?;

    let value = match result {
        FunctionResult::Value(v) => v,
        FunctionResult::ErrorMessage(msg) => {
            return Err(FunctionError {
                code: "SERVER_ERROR".to_string(),
                message: msg,
                severity: ErrorSeverity::High,
            }
            .into());
        }
        FunctionResult::ConvexError(err) => {
            let structured_err = parse_function_error(&err);
            return Err(structured_err.into());
        }
    };

    let response: K = from_convex_value(value)?;

    Ok(response)
}

#[cfg(test)]
pub async fn query<T, K>(_client: &mut ConvexClient, function_name: &str, _arg: T) -> Result<K>
where
    T: FunctionArg,
    K: DeserializeOwned,
{
    mock::internal_get_query_response(function_name)
}

pub async fn protected_query<T, K>(
    client: &mut ConvexClient,
    function_name: &str,
    arg: T,
    access_token: String,
) -> Result<K>
where
    T: FunctionArg,
    K: DeserializeOwned,
{
    client.set_auth(Some(access_token)).await;
    let result = query(client, function_name, arg)
        .await
        .context("Failed to execute protected query")?;
    client.set_auth(None).await;
    Ok(result)
}

#[cfg(not(test))]
pub async fn mutation<T, K>(client: &mut ConvexClient, function_name: &str, arg: T) -> Result<K>
where
    T: FunctionArg,
    K: DeserializeOwned,
{
    let args = arg.to_args()?;
    let result = client
        .mutation(function_name, args)
        .await
        .context("Failed to execute Convex mutation")?;

    let value = match result {
        FunctionResult::Value(v) => v,
        FunctionResult::ErrorMessage(msg) => {
            return Err(FunctionError {
                code: "SERVER_ERROR".to_string(),
                message: msg,
                severity: ErrorSeverity::High,
            }
            .into());
        }
        FunctionResult::ConvexError(err) => {
            let structured_err = parse_function_error(&err);
            return Err(structured_err.into());
        }
    };

    let response: K = from_convex_value(value)?;

    Ok(response)
}

#[cfg(test)]
pub async fn mutation<T, K>(_client: &mut ConvexClient, function_name: &str, _arg: T) -> Result<K>
where
    T: FunctionArg,
    K: DeserializeOwned,
{
    mock::internal_get_mutation_response(function_name)
}

pub async fn protected_mutation<T, K>(
    client: &mut ConvexClient,
    function_name: &str,
    arg: T,
    access_token: String,
) -> Result<K>
where
    T: FunctionArg,
    K: DeserializeOwned,
{
    client.set_auth(Some(access_token)).await;
    let result = mutation(client, function_name, arg)
        .await
        .context("Failed to execute protected mutation")?;
    client.set_auth(None).await;
    Ok(result)
}

#[cfg(test)]
pub mod mock {
    use super::*;
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    static QUERY_RESPONSES: OnceLock<Mutex<HashMap<String, Vec<String>>>> = OnceLock::new();
    static QUERY_CALL_INDEX: OnceLock<Mutex<HashMap<String, usize>>> = OnceLock::new();
    static MUTATION_RESPONSES: OnceLock<Mutex<HashMap<String, Vec<String>>>> = OnceLock::new();
    static MUTATION_CALL_INDEX: OnceLock<Mutex<HashMap<String, usize>>> = OnceLock::new();

    pub fn reset() {
        if let Some(responses) = QUERY_RESPONSES.get() {
            responses.lock().unwrap().clear();
        }
        if let Some(indices) = QUERY_CALL_INDEX.get() {
            indices.lock().unwrap().clear();
        }
        if let Some(responses) = MUTATION_RESPONSES.get() {
            responses.lock().unwrap().clear();
        }
        if let Some(indices) = MUTATION_CALL_INDEX.get() {
            indices.lock().unwrap().clear();
        }
    }

    pub fn mock_query<T: serde::Serialize>(function_name: &str, response: T) {
        let responses = QUERY_RESPONSES.get_or_init(|| Mutex::new(HashMap::new()));
        let json = serde_json::to_string(&response).expect("Failed to serialize mock response");
        responses
            .lock()
            .unwrap()
            .entry(function_name.to_string())
            .or_insert_with(Vec::new)
            .push(json);
    }

    pub fn mock_mutation<T: serde::Serialize>(function_name: &str, response: T) {
        let responses = MUTATION_RESPONSES.get_or_init(|| Mutex::new(HashMap::new()));
        let json = serde_json::to_string(&response).expect("Failed to serialize mock response");
        responses
            .lock()
            .unwrap()
            .entry(function_name.to_string())
            .or_insert_with(Vec::new)
            .push(json);
    }

    pub(super) fn internal_get_query_response<K: serde::de::DeserializeOwned>(
        function_name: &str,
    ) -> Result<K> {
        let responses = QUERY_RESPONSES.get_or_init(|| Mutex::new(HashMap::new()));
        let indices = QUERY_CALL_INDEX.get_or_init(|| Mutex::new(HashMap::new()));

        let response_list = responses.lock().unwrap();
        let response_json = response_list
            .get(function_name)
            .and_then(|list| {
                let mut idx = indices.lock().unwrap();
                let current = *idx.entry(function_name.to_string()).or_insert(0);
                *idx.get_mut(function_name).unwrap() += 1;
                list.get(current)
            })
            .ok_or_else(|| anyhow::anyhow!("No mock query for {}", function_name))?;

        let json_value: serde_json::Value =
            serde_json::from_str(response_json).context("Failed to parse mock response JSON")?;

        if let Some(obj) = json_value.as_object() {
            if obj.contains_key("__mock_error__") {
                let message = obj
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Mock error");
                let code = obj
                    .get("code")
                    .and_then(|v| v.as_str())
                    .unwrap_or("SERVER_ERROR");

                return Err(anyhow::anyhow!(super::FunctionError {
                    code: code.to_string(),
                    message: message.to_string(),
                    severity: super::ErrorSeverity::Medium,
                }));
            }
        }

        serde_json::from_value(json_value).context("Failed to deserialize mock query response")
    }

    pub(super) fn internal_get_mutation_response<K: serde::de::DeserializeOwned>(
        function_name: &str,
    ) -> Result<K> {
        let responses = MUTATION_RESPONSES.get_or_init(|| Mutex::new(HashMap::new()));
        let indices = MUTATION_CALL_INDEX.get_or_init(|| Mutex::new(HashMap::new()));

        let response_list = responses.lock().unwrap();
        let response_json = response_list
            .get(function_name)
            .and_then(|list| {
                let mut idx = indices.lock().unwrap();
                let current = *idx.entry(function_name.to_string()).or_insert(0);
                *idx.get_mut(function_name).unwrap() += 1;
                list.get(current)
            })
            .ok_or_else(|| anyhow::anyhow!("No mock mutation for {}", function_name))?;

        let json_value: serde_json::Value =
            serde_json::from_str(response_json).context("Failed to parse mock response JSON")?;

        if let Some(obj) = json_value.as_object() {
            if obj.contains_key("__mock_error__") {
                let message = obj
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Mock error");
                let code = obj
                    .get("code")
                    .and_then(|v| v.as_str())
                    .unwrap_or("SERVER_ERROR");

                return Err(anyhow::anyhow!(super::FunctionError {
                    code: code.to_string(),
                    message: message.to_string(),
                    severity: super::ErrorSeverity::Medium,
                }));
            }
        }

        serde_json::from_value(json_value).context("Failed to deserialize mock mutation response")
    }
}
