import http.server
import socketserver
import json
import sqlite3
import os
import urllib.parse
import urllib.request
import http.cookiejar
import ssl

PORT = int(os.environ.get("PORT", 8080))
DB_FILE = "aadhaar_history.db"

# Disable SSL verification for development if needed (UIDAI servers can sometimes have certificate issues)
ssl_context = ssl._create_unverified_context()

# Initialize global session with cookie support and SSL context
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ssl_context)
)

def init_db():
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            timestamp TEXT,
            data TEXT
        )
    ''')
    conn.commit()
    conn.close()

class AadhaarRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/history':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("SELECT data FROM history ORDER BY timestamp DESC LIMIT 50")
            rows = cursor.fetchall()
            conn.close()
            
            history = [json.loads(row[0]) for row in rows]
            self.wfile.write(json.dumps(history).encode())
        else:
            return super().do_GET()

    def do_POST(self):
        if self.path == '/api/history':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            item = json.loads(post_data.decode('utf-8'))
            
            conn = sqlite3.connect(DB_FILE)
            cursor = conn.cursor()
            cursor.execute("INSERT OR REPLACE INTO history (id, timestamp, data) VALUES (?, ?, ?)", 
                           (item['id'], item['timestamp'], json.dumps(item)))
            
            # Enforce history limit (50)
            cursor.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY timestamp DESC LIMIT 50)")
            
            conn.commit()
            conn.close()
            
            self.send_response(201)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "success"}).encode())

        elif self.path.startswith('/api/proxy/'):
            self.handle_proxy()

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, x-request-id, appid')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def handle_proxy(self):
        target_path = self.path[len('/api/proxy/'):]
        
        # Mapping frontend proxy paths to UIDAI endpoints
        proxy_map = {
            'captcha': 'https://tathya.uidai.gov.in/audioCaptchaService/api/captcha/v3/generation',
            'otp': 'https://tathya.uidai.gov.in/unifiedAppAuthService/api/v2/generate/aadhaar/otp',
            'download': 'https://tathya.uidai.gov.in/downloadAadhaarService/api/aadhaar/download'
        }
        
        if target_path not in proxy_map:
            self.send_error(404, "Proxy mapping not found")
            return

        url = proxy_map[target_path]
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length) if content_length > 0 else None
        
        # Forward specific headers
        headers = {
            'Content-Type': self.headers.get('Content-Type', 'application/json'),
            'appid': self.headers.get('appid', 'MYAADHAAR'),
            'x-request-id': self.headers.get('x-request-id', ''),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
        }

        req = urllib.request.Request(url, data=post_data, headers=headers, method='POST')
        
        try:
            with opener.open(req) as response:
                resp_data = response.read()
                self.send_response(response.status)
                self.send_cors_headers()
                # Forward important response headers
                for header in ['Content-Type', 'Content-Encoding', 'Content-Length', 'Set-Cookie']:
                    if header in response.headers:
                        self.send_header(header, response.headers[header])
                self.end_headers()
                self.wfile.write(resp_data)
        except urllib.error.HTTPError as e:
            resp_data = e.read()
            self.send_response(e.code)
            self.send_cors_headers()
            for header in ['Content-Type', 'Content-Encoding', 'Content-Length']:
                if header in e.headers:
                    self.send_header(header, e.headers[header])
            self.end_headers()
            self.wfile.write(resp_data)
        except Exception as e:
            self.send_response(500)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_DELETE(self):
        if self.path.startswith('/api/history'):
            parsed_path = urllib.parse.urlparse(self.path)
            query_params = urllib.parse.parse_qs(parsed_path.query)
            item_id = query_params.get('id', [None])[0]
            
            if item_id:
                conn = sqlite3.connect(DB_FILE)
                cursor = conn.cursor()
                cursor.execute("DELETE FROM history WHERE id = ?", (item_id,))
                conn.commit()
                conn.close()
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "deleted"}).encode())
            else:
                self.send_response(400)
                self.end_headers()

class ThreadingTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

if __name__ == "__main__":
    init_db()
    # No changes needed to the server start, but we should handle the port carefully if already running
    # The existing server is running on line 8, PORT=8080
    with ThreadingTCPServer(("", PORT), AadhaarRequestHandler) as httpd:
        print(f"Aadhaar API Server running at http://localhost:{PORT}")
        print(f"Database: {os.path.abspath(DB_FILE)}")
        httpd.serve_forever()
