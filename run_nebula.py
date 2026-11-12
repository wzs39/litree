#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_nebula.py
Cross-platform local HTTP server and browser launcher for Interactive Nebula Graph View.
Serves workspace on a free local port and automatically launches the default browser.
Supports --no-browser flag for headless/testing environments.
"""

import os
import sys
import socket
import webbrowser
import threading
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent

class NebulaHTTPRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WORKSPACE_ROOT), **kwargs)

    def log_message(self, format, *args):
        # Keep console output concise
        pass

def find_available_port(start_port=8765, max_attempts=50):
    for port in range(start_port, start_port + max_attempts):
        if port > 65535:
            break
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('127.0.0.1', port))
                return port
            except (OSError, ValueError):
                continue
    return None

def main():
    parser = argparse.ArgumentParser(description="Launch Nebula Graph View local HTTP server")
    parser.add_argument("--port", type=int, default=8765, help="Port to bind server (default: 8765)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open default browser")
    args = parser.parse_args()

    port = find_available_port(args.port, max_attempts=50)
    if port is None:
        print("=" * 65, file=sys.stderr)
        print("★ [ERROR] Port Exhaustion: Could not bind Nebula local server.", file=sys.stderr)
        print(f"Scanned 50 consecutive ports starting from {args.port}, but all ports were occupied.", file=sys.stderr)
        print("Please specify a different starting port with: python run_nebula.py --port <PORT>", file=sys.stderr)
        print("=" * 65, file=sys.stderr)
        sys.exit(1)

    try:
        server_address = ('127.0.0.1', port)
        httpd = HTTPServer(server_address, NebulaHTTPRequestHandler)
    except OSError as err:
        print("=" * 65, file=sys.stderr)
        print(f"★ [ERROR] Failed to start HTTP server on port {port}: {err}", file=sys.stderr)
        print("Please check your local network permissions or specify a different port.", file=sys.stderr)
        print("=" * 65, file=sys.stderr)
        sys.exit(1)

    url = f"http://localhost:{port}/nebula_view/index.html"
    print("=" * 65)
    print("★ NEBULA KNOWLEDGE GRAPH VIEWER — LOCAL SERVER")
    print("=" * 65)
    print(f"Workspace Directory : {WORKSPACE_ROOT}")
    print(f"Local Server URL    : {url}")
    print("Press Ctrl+C to terminate the server anytime.")
    print("=" * 65)

    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[Nebula Server] Stopped gracefully.")
        httpd.server_close()
        sys.exit(0)

if __name__ == "__main__":
    main()
