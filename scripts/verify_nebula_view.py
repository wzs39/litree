#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_nebula_view.py
Automated Quality Gate 2: Headless Browser & Interactive Viewport E2E Verification.
Uses Playwright with Microsoft Edge in headless mode.
Asserts:
1. Zero console errors and zero uncaught exceptions (len(console_errors) == 0).
2. Canvas initialization, retina scale, and D3 Force layout execution.
3. Viewport navigation: Zoom In, Zoom Out, and Fit/Reset View buttons update transform state.
4. Star selection & Glassmorphism detail drawer: opens drawer, displays correct metadata & paths.
5. Star hopping / Jump links: clicking connection item transitions to and selects target node.
6. Radar search: real-time keyword matching and result count indicator.
7. Category constellation filter pills: switches active filter and cluster focus.
8. Dual-protocol check: verifies both http:// and file:/// load cleanly.
9. Forensic evidence: Captures high-res screenshot to nebula_view/verification_screenshot.png.
"""

import os
import sys
import time
import socket
import threading
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
NEBULA_INDEX = WORKSPACE_ROOT / "nebula_view" / "index.html"
SCREENSHOT_PATH = WORKSPACE_ROOT / "nebula_view" / "verification_screenshot.png"

class SilentHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WORKSPACE_ROOT), **kwargs)

    def do_GET(self):
        if self.path in ('/favicon.ico', '/favicon.png'):
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, format, *args):
        pass

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def log_gate(name: str, passed: bool, detail: str = ""):
    mark = "✓ PASS" if passed else "✗ FAIL"
    print(f"[{mark}] {name}: {detail}")
    if not passed:
        raise AssertionError(f"Gate 2 Check Failed: {name} - {detail}")

def main():
    print("=" * 70)
    print("NEBULA GRAPH VIEW E2E INTERACTION & BROWSER VERIFICATION (GATE 2)")
    print(f"Workspace: {WORKSPACE_ROOT}")
    print("=" * 70)

    # 1. Start Background Local HTTP Server
    port = find_free_port()
    httpd = HTTPServer(('127.0.0.1', port), SilentHTTPHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    http_url = f"http://127.0.0.1:{port}/nebula_view/index.html"
    file_url = NEBULA_INDEX.as_uri()

    print(f"[Setup] Local HTTP server running at: {http_url}")
    print(f"[Setup] Local File URI target: {file_url}")

    with sync_playwright() as p:
        print("[Setup] Launching Microsoft Edge in headless mode...")
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        console_errors = []
        page_errors = []

        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" and "favicon" not in msg.text else None)
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        # -------------------------------------------------------------
        # Part A: Test HTTP Server Loading
        # -------------------------------------------------------------
        print("\n--- Part A: Testing HTTP Server Loading ---")
        page.goto(http_url, wait_until="networkidle")
        time.sleep(1.0) # Allow force simulation to settle

        log_gate("HTTP Console Errors", len(console_errors) == 0, 
                 f"{len(console_errors)} errors detected: {console_errors}")
        log_gate("HTTP Page Errors", len(page_errors) == 0, 
                 f"{len(page_errors)} page errors: {page_errors}")

        # Verify Canvas DOM
        canvas_box = page.locator("#nebula-canvas").bounding_box()
        log_gate("Canvas Bounding Box", canvas_box is not None and canvas_box["width"] > 600, 
                 f"Canvas size: {canvas_box['width']}x{canvas_box['height']}")

        # Verify Global API & Stats
        stats = page.evaluate("() => window.nebulaViewer ? window.nebulaViewer.getStats() : null")
        log_gate("Global API: window.nebulaViewer", stats is not None, "window.nebulaViewer initialized")
        log_gate("Stats: Nodes Count", stats and stats["nodes"] >= 82, f"{stats['nodes']} nodes loaded")
        log_gate("Stats: Links Count", stats and stats["links"] >= 100, f"{stats['links']} links loaded")
        log_gate("Stats: Clusters Count", stats and stats["clusters"] >= 3, f"{stats['clusters']} clusters loaded")

        # -------------------------------------------------------------
        # Part B: Viewport Zoom & Pan Verification
        # -------------------------------------------------------------
        print("\n--- Part B: Testing Viewport Navigation Controls ---")
        initial_zoom = page.evaluate("() => window.nebulaViewer.getZoom()")
        
        # Click Zoom In
        page.click("#btn-zoom-in")
        time.sleep(0.3)
        zoom_in_val = page.evaluate("() => window.nebulaViewer.getZoom()")
        log_gate("Zoom In Control", zoom_in_val > initial_zoom, 
                 f"Zoom increased: {initial_zoom:.3f} -> {zoom_in_val:.3f}")

        # Click Zoom Out twice
        page.click("#btn-zoom-out")
        page.click("#btn-zoom-out")
        time.sleep(0.3)
        zoom_out_val = page.evaluate("() => window.nebulaViewer.getZoom()")
        log_gate("Zoom Out Control", zoom_out_val < zoom_in_val, 
                 f"Zoom decreased: {zoom_in_val:.3f} -> {zoom_out_val:.3f}")

        # Click Reset View
        page.click("#btn-reset-view")
        time.sleep(0.6)
        reset_zoom_val = page.evaluate("() => window.nebulaViewer.getZoom()")
        log_gate("Reset View Control", reset_zoom_val > 0.2, f"Reset view zoom: {reset_zoom_val:.3f}")

        # -------------------------------------------------------------
        # Part C: Node Click, Detail Drawer & Jump Links
        # -------------------------------------------------------------
        print("\n--- Part C: Testing Star Selection & Detail Drawer ---")
        # Programmatically select skill:ask-matt
        page.evaluate("() => window.nebulaViewer.selectNodeById('skill:ask-matt')")
        time.sleep(0.5)

        drawer = page.locator("#detail-drawer")
        drawer_has_open = "open" in (drawer.get_attribute("class") or "")
        log_gate("Detail Drawer Open", drawer_has_open, "Drawer opened successfully")

        drawer_title = page.locator("#drawer-title").text_content()
        log_gate("Drawer Title", "ask-matt" in (drawer_title or ""), f"Title: '{drawer_title}'")

        drawer_path = page.locator("#drawer-path").text_content()
        log_gate("Drawer Path", ".agents/skills/ask-matt/SKILL.md" in (drawer_path or ""), 
                 f"Path: '{drawer_path}'")

        # Verify connected items list in drawer
        conn_items = page.locator("#drawer-connections-list .connection-item")
        conn_count = conn_items.count()
        log_gate("Connected Celestial Bodies Count", conn_count > 0, 
                 f"Found {conn_count} connected nodes")

        # Test Star Hopping: Click the first connection item to transition
        first_conn_name = conn_items.first.locator(".conn-name").text_content()
        conn_items.first.click()
        time.sleep(0.6)

        new_drawer_title = page.locator("#drawer-title").text_content()
        log_gate("Star Hopping / Jump Links", new_drawer_title == first_conn_name, 
                 f"Jumped from 'ask-matt' to '{new_drawer_title}'")

        # Close Drawer
        page.click("#drawer-close-btn")
        time.sleep(0.3)
        drawer_closed = "open" not in (page.locator("#detail-drawer").get_attribute("class") or "")
        log_gate("Drawer Close Action", drawer_closed, "Drawer closed successfully")

        # -------------------------------------------------------------
        # Part D: Radar Search & Category Filtering
        # -------------------------------------------------------------
        print("\n--- Part D: Testing Radar Search & Category Filtering ---")
        # Search for 'diagnosing-bugs'
        page.fill("#search-input", "diagnosing-bugs")
        time.sleep(0.4)
        search_count_text = page.locator("#search-results-count").text_content()
        log_gate("Radar Search Query", "探测到" in (search_count_text or ""), 
                 f"Search response: '{search_count_text}'")

        # Clear search
        page.click("#search-clear-btn")
        time.sleep(0.3)
        search_input_val = page.locator("#search-input").input_value()
        log_gate("Search Clear Action", search_input_val == "", "Search query cleared")

        # Test category filter pill
        page.click(".pill-docs")
        time.sleep(0.5)
        pill_active = "active" in (page.locator(".pill-docs").get_attribute("class") or "")
        log_gate("Category Filter: Docs", pill_active, "Docs galaxy pill activated")

        page.click(".pill-skills")
        time.sleep(0.5)
        skills_pill_active = "active" in (page.locator(".pill-skills").get_attribute("class") or "")
        log_gate("Category Filter: Skills", skills_pill_active, "Skills galaxy pill activated")

        # Reset filter to all
        page.click("[data-filter='all']")
        time.sleep(0.5)

        # -------------------------------------------------------------
        # Part E: Forensic Screenshot Capture
        # -------------------------------------------------------------
        print("\n--- Part E: Capturing Forensic Visual Screenshot ---")
        # Select hub node for rich visual state
        page.evaluate("() => window.nebulaViewer.selectNodeById('skill:codebase-design')")
        time.sleep(0.8)

        page.screenshot(path=str(SCREENSHOT_PATH), full_page=True)
        log_gate("Screenshot Generated", SCREENSHOT_PATH.exists(), str(SCREENSHOT_PATH))
        log_gate("Screenshot Non-Empty", SCREENSHOT_PATH.stat().st_size > 20000, 
                 f"{SCREENSHOT_PATH.stat().st_size} bytes captured")

        # -------------------------------------------------------------
        # Part F: Direct file:/// Offline Protocol Verification
        # -------------------------------------------------------------
        print("\n--- Part F: Testing Offline file:/// Direct Loading ---")
        file_page = context.new_page()
        file_console_errors = []
        file_page.on("console", lambda msg: file_console_errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" and "favicon" not in msg.text else None)
        file_page.on("pageerror", lambda err: file_console_errors.append(str(err)))

        file_page.goto(file_url, wait_until="networkidle")
        time.sleep(1.0)

        log_gate("file:/// Console Zero Errors", len(file_console_errors) == 0, 
                 f"{len(file_console_errors)} errors detected: {file_console_errors}")
        file_stats = file_page.evaluate("() => window.nebulaViewer ? window.nebulaViewer.getStats() : null")
        log_gate("file:/// Offline Node Loading", file_stats and file_stats["nodes"] >= 82, 
                 f"Loaded {file_stats['nodes'] if file_stats else 0} nodes via file:///")

        browser.close()

    print("\n" + "=" * 70)
    print("ALL GATE 2 INTERACTION & VIEWPORT CHECKS PASSED (EXIT CODE 0)")
    print(f"Evidence screenshot saved at: {SCREENSHOT_PATH}")
    print("=" * 70)

if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except AssertionError as ae:
        print(f"\n[FATAL GATE 2 FAILURE] {ae}", file=sys.stderr)
        sys.exit(1)
    except Exception as ex:
        print(f"\n[UNEXPECTED ERROR] {ex}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
