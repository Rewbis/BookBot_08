import os
import json
import re
from datetime import datetime

def log_llm_call(role: str, messages: list, response: str, model: str, project_title: str = "unknown"):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_data = {
        "timestamp": timestamp,
        "role": role,
        "model": model,
        "message_count": len(messages),
        "total_input_chars": sum(len(m.get("content", "")) for m in messages),
        "total_output_chars": len(response),
        "messages": messages,
        "response": response
    }
    
    sanitised_title = re.sub(r'[^a-zA-Z0-9\s_]', '', project_title).strip().replace(' ', '_').lower()[:40]
    if not sanitised_title:
        sanitised_title = "unknown"
        
    log_dir = os.path.join("logs", sanitised_title)
    os.makedirs(log_dir, exist_ok=True)
    
    log_file = os.path.join(log_dir, f"{timestamp}_{role}.json")
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(log_data, f, indent=2, ensure_ascii=False)
        
    session_log = os.path.join(log_dir, "session.log")
    with open(session_log, "a", encoding="utf-8") as f:
        f.write(f"{timestamp} | {role} | {len(response)} chars\n")
