#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scan_nebula_assets.py
Comprehensive workspace scanner and relationship mapper for Interactive Nebula Graph View.
Scans docs/**/*.md (29 docs), .agents/skills/*/SKILL.md (39 skills), root specs, core python scripts/modules.
Extracts frontmatter, descriptions, headings, tags, dependencies, and twin relations.
Outputs dual-mode datasets: nebula_view/nebula_data.json and nebula_view/nebula_data.js (window.NEBULA_DATA).
"""

import os
import sys
import json
import glob
import re
import ast
import yaml
from datetime import datetime, timezone
from pathlib import Path

# Workspace root
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent

# Output paths
NEBULA_VIEW_DIR = WORKSPACE_ROOT / "nebula_view"
OUTPUT_JSON = NEBULA_VIEW_DIR / "nebula_data.json"
OUTPUT_JS = NEBULA_VIEW_DIR / "nebula_data.js"

# Strict exclusion directories to prevent traversing massive folders
IGNORE_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".agents/teamwork",
    "profiles",
    "agy-response-dump",
    ".gemini",
    "state",
    ".vscode",
    ".idea"
}


def parse_markdown_frontmatter(content: str):
    """Extract YAML frontmatter and markdown body."""
    frontmatter = {}
    body = content
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            raw_fm = parts[1]
            body = parts[2].strip()
            try:
                parsed = yaml.safe_load(raw_fm)
                if isinstance(parsed, dict):
                    frontmatter = parsed
            except Exception:
                pass
    return frontmatter, body


def extract_first_heading_and_summary(content: str):
    """Extract the first H1/H2 heading and first meaningful paragraph."""
    lines = content.splitlines()
    heading = None
    summary_lines = []
    in_code_block = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            in_code_block = not in_code_block
            continue
        if in_code_block:
            continue

        if not heading and stripped.startswith("#"):
            heading = re.sub(r"^#+\s*", "", stripped).strip()
            continue

        if heading and stripped:
            if not stripped.startswith("#") and not stripped.startswith(">"):
                summary_lines.append(stripped)
                if len(" ".join(summary_lines)) > 120:
                    break

    summary = " ".join(summary_lines).strip()
    return heading, summary


def scan_skills():
    """Scan .agents/skills/*/SKILL.md (39 skills)."""
    skills_nodes = []
    skills_map = {}
    skills_dir = WORKSPACE_ROOT / ".agents" / "skills"

    if not skills_dir.exists():
        return skills_nodes, skills_map

    for skill_folder in sorted(skills_dir.iterdir()):
        if not skill_folder.is_dir():
            continue
        skill_id = skill_folder.name
        skill_md = skill_folder / "SKILL.md"
        if not skill_md.exists():
            continue

        content = skill_md.read_text(encoding="utf-8", errors="ignore")
        frontmatter, body = parse_markdown_frontmatter(content)
        heading, summary = extract_first_heading_and_summary(body)

        # Check openai.yaml for display_name
        display_name = skill_id.replace("-", " ").title()
        openai_yaml = skill_folder / "agents" / "openai.yaml"
        if openai_yaml.exists():
            try:
                oy_data = yaml.safe_load(openai_yaml.read_text(encoding="utf-8", errors="ignore"))
                if isinstance(oy_data, dict):
                    display_name = oy_data.get("display_name", display_name)
                    if not summary and oy_data.get("short_description"):
                        summary = oy_data.get("short_description")
            except Exception:
                pass

        description = frontmatter.get("description") or summary or f"Skill for {skill_id}"
        # Clean description
        description = re.sub(r"\s+", " ", description).strip()

        # Category determination
        category = "engineering"
        if any(term in skill_id for term in ["writing", "grill", "handoff", "teach", "wait-what", "to-questionnaire"]):
            category = "productivity"
        elif "setup" in skill_id or "git" in skill_id:
            category = "infrastructure"

        # Hub skills (key orchestrators, routers, or deep foundations)
        is_hub = skill_id in [
            "ask-matt", "chief-of-staff", "codebase-design", "diagnosing-bugs",
            "domain-modeling", "implement", "tdd", "triage", "wayfinder"
        ]

        # Supporting files
        supporting_files = []
        for sf in skill_folder.rglob("*"):
            if sf.is_file() and sf.name not in ["SKILL.md", "openai.yaml"]:
                rel = sf.relative_to(WORKSPACE_ROOT).as_posix()
                supporting_files.append(rel)

        tags = [category, "skill"]
        if is_hub:
            tags.append("hub")
        if frontmatter.get("disable-model-invocation"):
            tags.append("no-model-invoke")
        if "writing" in skill_id:
            tags.append("writing")
        elif "test" in skill_id or skill_id == "tdd":
            tags.append("testing")
        elif "review" in skill_id:
            tags.append("review")

        node = {
            "id": f"skill:{skill_id}",
            "name": skill_id,
            "displayName": display_name,
            "type": "skill",
            "category": category,
            "cluster": "galaxy-skills",
            "path": skill_md.relative_to(WORKSPACE_ROOT).as_posix(),
            "description": description,
            "tags": tags,
            "size": 26 if is_hub else 18,
            "color": "#e040fb" if is_hub else "#b388ff",
            "isHub": is_hub,
            "metadata": {
                "fileSize": skill_md.stat().st_size,
                "lineCount": len(content.splitlines()),
                "supportingFilesCount": len(supporting_files),
                "supportingFiles": supporting_files[:10],
                "hasFrontmatter": bool(frontmatter),
                "heading": heading
            },
            "content": content
        }
        skills_nodes.append(node)
        skills_map[skill_id] = node

    return skills_nodes, skills_map


def scan_docs():
    """Scan docs/**/*.md (29 docs)."""
    docs_nodes = []
    docs_map = {}
    docs_dir = WORKSPACE_ROOT / "docs"

    if not docs_dir.exists():
        return docs_nodes, docs_map

    for doc_file in sorted(docs_dir.rglob("*.md")):
        rel_path = doc_file.relative_to(WORKSPACE_ROOT).as_posix()
        content = doc_file.read_text(encoding="utf-8", errors="ignore")
        frontmatter, body = parse_markdown_frontmatter(content)
        heading, summary = extract_first_heading_and_summary(body)

        parts = doc_file.relative_to(docs_dir).parts
        subcat = parts[0] if len(parts) > 1 else "general"
        doc_stem = doc_file.stem
        node_id = f"doc:{subcat}/{doc_stem}"

        description = frontmatter.get("description") or summary or f"Documentation guide for {doc_stem}"
        description = re.sub(r"\s+", " ", description).strip()

        # Is hub doc
        is_hub = doc_stem in ["ask-matt", "codebase-design", "diagnosing-bugs", "triage", "wayfinder"]

        tags = [subcat, "documentation"]
        if is_hub:
            tags.append("core-guide")

        node = {
            "id": node_id,
            "name": f"{doc_stem}.md",
            "displayName": heading or doc_stem.replace("-", " ").title(),
            "type": "document",
            "category": subcat,
            "cluster": "galaxy-documents",
            "path": rel_path,
            "description": description,
            "tags": tags,
            "size": 22 if is_hub else 15,
            "color": "#00f2fe" if is_hub else "#38bdf8",
            "isHub": is_hub,
            "metadata": {
                "fileSize": doc_file.stat().st_size,
                "lineCount": len(content.splitlines()),
                "heading": heading,
                "subcat": subcat
            },
            "content": content,
            "stem": doc_stem
        }
        docs_nodes.append(node)
        docs_map[node_id] = node

    return docs_nodes, docs_map


def scan_modules_and_specs():
    """Scan root python modules, subsystems, and specifications."""
    module_nodes = []
    module_map = {}

    # 1. Root python modules (14 scripts)
    for py_file in sorted(WORKSPACE_ROOT.glob("*.py")):
        # Skip our own scanner/verifier if present in scripts
        rel_path = py_file.relative_to(WORKSPACE_ROOT).as_posix()
        content = py_file.read_text(encoding="utf-8", errors="ignore")

        # Extract docstring
        docstring = ""
        try:
            tree = ast.parse(content, filename=py_file.name)
            docstring = ast.get_docstring(tree) or ""
        except Exception:
            pass

        stem = py_file.stem
        node_id = f"module:{stem}"

        # Category and role
        category = "tools"
        is_hub = False
        color = "#ffd166"
        size = 16

        if "bridge" in stem or "addon" in stem or "quota" in stem or "unlock" in stem:
            category = "core-gateway"
            if stem in ["agy_unlock_addon", "gemini4_ultimate_bridge"]:
                is_hub = True
                size = 24
                color = "#f59e0b"
            else:
                size = 18
                color = "#fbbf24"
        elif "deck" in stem or "presentation" in stem or "diagram" in stem:
            category = "presentation-suite"
            size = 15
            color = "#f43f5e"

        first_line = (docstring.splitlines()[0] if docstring else "").strip()
        description = first_line or f"Python module {py_file.name} for {category}"

        node = {
            "id": node_id,
            "name": py_file.name,
            "displayName": stem.replace("_", " ").title(),
            "type": "module",
            "category": category,
            "cluster": "galaxy-modules",
            "path": rel_path,
            "description": description,
            "tags": [category, "python", "script"],
            "size": size,
            "color": color,
            "isHub": is_hub,
            "metadata": {
                "fileSize": py_file.stat().st_size,
                "lineCount": len(content.splitlines()),
                "docstring": docstring
            },
            "content": content
        }
        module_nodes.append(node)
        module_map[node_id] = node

    # 2. Subsystems: wechat_auto_checkin & lut-timetable
    subsystems = [
        {
            "id": "subsystem:wechat_auto_checkin",
            "name": "wechat_auto_checkin",
            "displayName": "WeChat Auto Check-in System",
            "path": "wechat_auto_checkin/README.md",
            "description": "Universal WeChat automated check-in and clock-in system with Siri/Scriptable & Termux integrations.",
            "category": "subsystems",
            "tags": ["subsystem", "automation", "python", "wechat"],
            "size": 22,
            "color": "#10b981",
            "isHub": True
        },
        {
            "id": "subsystem:lut-timetable",
            "name": "lut-timetable",
            "displayName": "LUT Timetable Application",
            "path": "lut-timetable/README.md",
            "description": "Multiplatform student timetable application built with React, TypeScript, Vite, Electron, and Capacitor.",
            "category": "subsystems",
            "tags": ["subsystem", "react", "typescript", "electron", "timetable"],
            "size": 22,
            "color": "#10b981",
            "isHub": True
        }
    ]

    for sub in subsystems:
        full_p = WORKSPACE_ROOT / sub["path"]
        if full_p.exists():
            content = full_p.read_text(encoding="utf-8", errors="ignore")
            node = {
                "id": sub["id"],
                "name": sub["name"],
                "displayName": sub["displayName"],
                "type": "subsystem",
                "category": sub["category"],
                "cluster": "galaxy-modules",
                "path": sub["path"],
                "description": sub["description"],
                "tags": sub["tags"],
                "size": sub["size"],
                "color": sub["color"],
                "isHub": sub["isHub"],
                "metadata": {
                    "fileSize": full_p.stat().st_size,
                    "exists": True
                },
                "content": content
            }
            module_nodes.append(node)
            module_map[node["id"]] = node

    # 3. Root architectural specs
    specs = [
        {
            "id": "spec:ELIGIBILITY-FIX",
            "name": "ELIGIBILITY-FIX-20261105.md",
            "displayName": "Eligibility Gateway Bypass Spec",
            "path": "ELIGIBILITY-FIX-20261105.md",
            "description": "Architectural specification detailing Mitmproxy loadCodeAssist response rewriting and quota recovery.",
            "category": "architecture-specs",
            "tags": ["spec", "architecture", "gateway"],
            "size": 20,
            "color": "#38bdf8",
            "isHub": False
        },
        {
            "id": "spec:SPEAKER_SCRIPT",
            "name": "SPEAKER_SCRIPT_AND_RECORDING_GUIDE.md",
            "displayName": "Speaker Script & Recording Guide",
            "path": "SPEAKER_SCRIPT_AND_RECORDING_GUIDE.md",
            "description": "Presentation narration script, live demo walkthrough sequence, and visual recording guidance.",
            "category": "architecture-specs",
            "tags": ["spec", "presentation", "recording"],
            "size": 18,
            "color": "#38bdf8",
            "isHub": False
        },
        {
            "id": "spec:PROJECT",
            "name": "PROJECT.md",
            "displayName": "Project Architecture & Composite Pipeline",
            "path": "PROJECT.md",
            "description": "Top-level project specification, composite milestone definitions, and subsystem interfaces.",
            "category": "architecture-specs",
            "tags": ["spec", "project", "milestones"],
            "size": 22,
            "color": "#00f2fe",
            "isHub": True
        }
    ]

    for spec in specs:
        full_p = WORKSPACE_ROOT / spec["path"]
        if full_p.exists():
            content = full_p.read_text(encoding="utf-8", errors="ignore")
            node = {
                "id": spec["id"],
                "name": spec["name"],
                "displayName": spec["displayName"],
                "type": "spec",
                "category": spec["category"],
                "cluster": "galaxy-modules",
                "path": spec["path"],
                "description": spec["description"],
                "tags": spec["tags"],
                "size": spec["size"],
                "color": spec["color"],
                "isHub": spec["isHub"],
                "metadata": {
                    "fileSize": full_p.stat().st_size,
                    "exists": True
                },
                "content": content
            }
            module_nodes.append(node)
            module_map[node["id"]] = node

    return module_nodes, module_map


def build_links(skills_nodes, docs_nodes, module_nodes):
    """Build cross-references, 1:1 twin relations, workflow transitions, and module dependencies."""
    all_node_ids = set()
    for n in skills_nodes + docs_nodes + module_nodes:
        all_node_ids.add(n["id"])

    links = []
    seen_links = set()

    def add_link(src, tgt, l_type, label, strength=0.7, distance=80, color=None):
        if src not in all_node_ids or tgt not in all_node_ids or src == tgt:
            return
        key = (src, tgt, l_type)
        if key in seen_links:
            return
        seen_links.add(key)
        links.append({
            "source": src,
            "target": tgt,
            "type": l_type,
            "label": label,
            "strength": strength,
            "distance": distance,
            "color": color or "rgba(255, 255, 255, 0.3)"
        })

    # 1. 1:1 Twin relations: doc <-> skill
    skills_by_name = {n["name"]: n["id"] for n in skills_nodes}

    for doc in docs_nodes:
        stem = doc["stem"]
        matched_skill_name = None
        if stem in skills_by_name:
            matched_skill_name = stem
        elif stem == "code-review" and "matt-code-review" in skills_by_name:
            matched_skill_name = "matt-code-review"

        if matched_skill_name:
            target_id = skills_by_name[matched_skill_name]
            add_link(
                doc["id"],
                target_id,
                "corresponds-to",
                "1:1 双生镜像 (Doc ↔ Skill)",
                strength=0.9,
                distance=65,
                color="rgba(0, 242, 254, 0.6)"
            )

    # Special doc cross references
    if "doc:agents/triage-labels" in all_node_ids:
        if "skill:triage" in all_node_ids:
            add_link("doc:agents/triage-labels", "skill:triage", "references", "标签关联", 0.75, 75, "rgba(56, 189, 248, 0.5)")
        if "skill:setup-matt-pocock-skills" in all_node_ids:
            add_link("doc:agents/triage-labels", "skill:setup-matt-pocock-skills", "references", "配置挂载", 0.75, 75, "rgba(56, 189, 248, 0.5)")

    if "doc:engineering/resolving-merge-conflicts" in all_node_ids:
        if "skill:implement" in all_node_ids:
            add_link("doc:engineering/resolving-merge-conflicts", "skill:implement", "references", "合并处置", 0.7, 80, "rgba(56, 189, 248, 0.5)")

    # 2. Explicit doc-to-skill cross-references from markdown links
    # Use path-boundary aware matching to prevent substring collisions (e.g. /primary-source matching /pr)
    sorted_skill_names = sorted(skills_by_name.keys(), key=len, reverse=True)
    for doc in docs_nodes:
        content = doc.get("content", "")
        stem = doc["stem"]
        md_links = re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content)
        for text, link_path in md_links:
            clean_text = text.strip('`').strip()
            matched_skill = None
            if clean_text in skills_by_name:
                matched_skill = clean_text
            elif clean_text == "code-review" and "matt-code-review" in skills_by_name:
                matched_skill = "matt-code-review"
            else:
                for s in sorted_skill_names:
                    # Require path boundary or skills prefix, and terminate at slash, .md, query, hash, or end
                    if re.search(r'(?:^|/|skills-)' + re.escape(s) + r'(?:/|\.md|$|\?|#)', link_path):
                        matched_skill = s
                        break
            if matched_skill and matched_skill != stem and not (stem == "code-review" and matched_skill == "matt-code-review"):
                add_link(
                    doc["id"],
                    skills_by_name[matched_skill],
                    "references",
                    "文档跨域引用 (Reference)",
                    strength=0.55,
                    distance=90,
                    color="rgba(56, 189, 248, 0.4)"
                )

    # 3. Workflow transitions between skills
    for skill in skills_nodes:
        content = skill.get("content", "")
        for other_name, other_id in skills_by_name.items():
            if other_name != skill["name"]:
                pattern = r'(?:\b|/|`|\[)' + re.escape(other_name) + r'(?:\b|`|\]|\.md)'
                if re.search(pattern, content):
                    is_router = skill["name"] in ["ask-matt", "chief-of-staff", "wayfinder"]
                    add_link(
                        skill["id"],
                        other_id,
                        "workflow-flow",
                        "工作流流转 (Workflow Flow)",
                        strength=0.5 if is_router else 0.7,
                        distance=95 if is_router else 80,
                        color="rgba(179, 136, 255, 0.45)"
                    )

    # Writing suite workflow transitions
    if "skill:writing-fragments" in all_node_ids and "skill:writing-beats" in all_node_ids:
        add_link("skill:writing-fragments", "skill:writing-beats", "workflow-flow", "写作流转: 碎片收集 ➔ 节拍组织", 0.7, 80, "rgba(179, 136, 255, 0.5)")
    if "skill:writing-shape" in all_node_ids and "skill:writing-beats" in all_node_ids:
        add_link("skill:writing-shape", "skill:writing-beats", "workflow-flow", "写作流转: 结构塑形 ➔ 节拍组织", 0.7, 80, "rgba(179, 136, 255, 0.5)")

    # 4. Python module dependencies & imports
    for mod in module_nodes:
        if mod["type"] == "module":
            content = mod.get("content", "")
            try:
                tree = ast.parse(content, filename=mod["name"])
                for ast_node in ast.walk(tree):
                    imported = None
                    if isinstance(ast_node, ast.Import):
                        for n in ast_node.names:
                            imported = n.name
                    elif isinstance(ast_node, ast.ImportFrom):
                        if ast_node.module:
                            imported = ast_node.module
                    if imported:
                        mod_target = f"module:{imported}"
                        if mod_target in all_node_ids and mod_target != mod["id"]:
                            add_link(
                                mod["id"],
                                mod_target,
                                "module-dependency",
                                "代码级引用 (Import)",
                                strength=0.8,
                                distance=70,
                                color="rgba(255, 209, 102, 0.6)"
                            )
            except Exception:
                pass

    # 5. Connect test scripts to the modules they test
    for mod in module_nodes:
        if mod["name"].startswith("test_") and mod["type"] == "module":
            tested_stem = mod["name"][5:].replace(".py", "")
            target_mod_id = f"module:{tested_stem}"
            if target_mod_id in all_node_ids:
                add_link(
                    mod["id"],
                    target_mod_id,
                    "tests-module",
                    "单元测试套件驱动 (Tests Module)",
                    strength=0.9,
                    distance=60,
                    color="rgba(255, 209, 102, 0.8)"
                )

    # 6. Gateway <-> Specs relationships
    if "module:agy_unlock_addon" in all_node_ids and "spec:ELIGIBILITY-FIX" in all_node_ids:
        add_link(
            "module:agy_unlock_addon",
            "spec:ELIGIBILITY-FIX",
            "implements-spec",
            "规范落地 (Implements)",
            strength=0.85,
            distance=70,
            color="rgba(245, 158, 11, 0.7)"
        )

    # Presentation suite dependencies
    deck_modules = [m["id"] for m in module_nodes if "deck" in m["id"] or "presentation" in m["id"]]
    if "module:generate_deck_diagrams" in all_node_ids:
        for dm in deck_modules:
            if dm != "module:generate_deck_diagrams":
                add_link(
                    "module:generate_deck_diagrams",
                    dm,
                    "provides-asset",
                    "插图资产供给 (Diagram Asset)",
                    strength=0.65,
                    distance=85,
                    color="rgba(244, 63, 94, 0.5)"
                )

    if "spec:SPEAKER_SCRIPT" in all_node_ids:
        for dm in deck_modules[:4]:
            add_link(
                dm,
                "spec:SPEAKER_SCRIPT",
                "implements-spec",
                "演讲指引对应 (Guide)",
                strength=0.6,
                distance=90,
                color="rgba(244, 63, 94, 0.5)"
            )

    if "spec:PROJECT" in all_node_ids:
        if "module:gemini4_ultimate_bridge" in all_node_ids:
            add_link("spec:PROJECT", "module:gemini4_ultimate_bridge", "defines", "顶层架构定义", 0.6, 95, "rgba(0, 242, 254, 0.4)")
        if "subsystem:wechat_auto_checkin" in all_node_ids:
            add_link("spec:PROJECT", "subsystem:wechat_auto_checkin", "defines", "子系统定义", 0.6, 95, "rgba(0, 242, 254, 0.4)")
        if "subsystem:lut-timetable" in all_node_ids:
            add_link("spec:PROJECT", "subsystem:lut-timetable", "defines", "子系统定义", 0.6, 95, "rgba(0, 242, 254, 0.4)")
        if "module:create_presentation" in all_node_ids:
            add_link("spec:PROJECT", "module:create_presentation", "defines", "演示文稿生成引擎", 0.6, 95, "rgba(0, 242, 254, 0.4)")
        if "module:generate_deck_diagrams" in all_node_ids:
            add_link("spec:PROJECT", "module:generate_deck_diagrams", "defines", "插图生成渲染引擎", 0.6, 95, "rgba(0, 242, 254, 0.4)")

    # 7. Dynamic text scanning: Scan specs and docs for references to core modules & subsystems
    core_module_identifiers = {
        "agy_unlock_addon": "module:agy_unlock_addon",
        "gemini4_ultimate_bridge": "module:gemini4_ultimate_bridge",
        "test_gemini4_bridge": "module:test_gemini4_bridge",
        "quota_readout": "module:quota_readout",
        "run_nebula": "module:run_nebula",
        "wechat_auto_checkin": "subsystem:wechat_auto_checkin",
        "lut-timetable": "subsystem:lut-timetable",
        "generate_deck_diagrams": "module:generate_deck_diagrams",
        "build_8_slide_deck": "module:build_8_slide_deck",
        "create_presentation": "module:create_presentation"
    }

    scan_targets = docs_nodes + [n for n in module_nodes if n["type"] in ("spec", "subsystem")]
    for item in scan_targets:
        text = item.get("content", "")
        if not text:
            continue
        for mod_name, mod_id in core_module_identifiers.items():
            if mod_id != item["id"] and mod_id in all_node_ids:
                if re.search(r'\b' + re.escape(mod_name) + r'(?:\.py|\b)', text):
                    add_link(
                        item["id"],
                        mod_id,
                        "references-module",
                        "模块与代码引用 (Module Reference)",
                        strength=0.65,
                        distance=85,
                        color="rgba(255, 209, 102, 0.55)"
                    )

    # 8. Organic Cross-Cluster Bridges: Bridge galaxy-modules with galaxy-documents and galaxy-skills
    # Connect specifications with specification engineering docs & skills
    if "spec:PROJECT" in all_node_ids:
        if "doc:engineering/implement-spec" in all_node_ids:
            add_link("doc:engineering/implement-spec", "spec:PROJECT", "spec-implementation", "工程规约落地方法论", 0.75, 80, "rgba(0, 242, 254, 0.5)")
        if "skill:implement-spec" in all_node_ids:
            add_link("skill:implement-spec", "spec:PROJECT", "implements-spec", "架构规约落地实施", 0.8, 75, "rgba(179, 136, 255, 0.6)")
        if "doc:engineering/to-spec" in all_node_ids:
            add_link("doc:engineering/to-spec", "spec:PROJECT", "spec-authoring", "架构规约制定标准", 0.75, 80, "rgba(0, 242, 254, 0.5)")
        if "skill:to-spec" in all_node_ids:
            add_link("skill:to-spec", "spec:PROJECT", "creates-spec", "架构规约起草与设计", 0.8, 75, "rgba(179, 136, 255, 0.6)")
        if "doc:engineering/improve-codebase-architecture" in all_node_ids:
            add_link("doc:engineering/improve-codebase-architecture", "spec:PROJECT", "architecture-governance", "系统级架构治理规范", 0.7, 85, "rgba(0, 242, 254, 0.5)")
        if "skill:improve-codebase-architecture" in all_node_ids:
            add_link("skill:improve-codebase-architecture", "spec:PROJECT", "architecture-governance", "全景架构演进评估", 0.7, 85, "rgba(179, 136, 255, 0.5)")
        if "module:run_nebula" in all_node_ids:
            add_link("module:run_nebula", "spec:PROJECT", "runtime-engine", "星云图谱本地服务引擎", 0.75, 80, "rgba(255, 209, 102, 0.6)")
        if "skill:setup-pre-commit" in all_node_ids:
            add_link("skill:setup-pre-commit", "spec:PROJECT", "quality-gate", "提交前自动化门禁配置", 0.75, 80, "rgba(179, 136, 255, 0.5)")
        if "skill:git-guardrails-claude-code" in all_node_ids:
            add_link("skill:git-guardrails-claude-code", "spec:PROJECT", "safety-guardrail", "Git操作安全防护护栏", 0.7, 85, "rgba(179, 136, 255, 0.5)")
        if "skill:scaffold-exercises" in all_node_ids:
            add_link("skill:scaffold-exercises", "spec:PROJECT", "educational-scaffold", "教学实验脚手架规范", 0.7, 85, "rgba(179, 136, 255, 0.5)")

    if "spec:ELIGIBILITY-FIX" in all_node_ids:
        if "doc:engineering/implement-spec" in all_node_ids:
            add_link("doc:engineering/implement-spec", "spec:ELIGIBILITY-FIX", "spec-implementation", "网关规约实施指南", 0.7, 85, "rgba(0, 242, 254, 0.5)")
        if "skill:implement-spec" in all_node_ids:
            add_link("skill:implement-spec", "spec:ELIGIBILITY-FIX", "implements-spec", "网关规约落地分解", 0.75, 80, "rgba(179, 136, 255, 0.5)")

    if "spec:SPEAKER_SCRIPT" in all_node_ids:
        if "skill:writing-beats" in all_node_ids:
            add_link("skill:writing-beats", "spec:SPEAKER_SCRIPT", "narrative-structure", "演讲讲稿节奏与分镜把控", 0.8, 75, "rgba(179, 136, 255, 0.6)")

    # Deep modules & TDD bridges
    if "module:gemini4_ultimate_bridge" in all_node_ids:
        if "doc:engineering/codebase-design" in all_node_ids:
            add_link("doc:engineering/codebase-design", "module:gemini4_ultimate_bridge", "design-practice", "深模块与防御性设计实践", 0.75, 80, "rgba(0, 242, 254, 0.5)")
        if "skill:codebase-design" in all_node_ids:
            add_link("skill:codebase-design", "module:gemini4_ultimate_bridge", "deep-module", "接口隔离与高内聚深模块", 0.8, 75, "rgba(179, 136, 255, 0.6)")

    if "module:test_gemini4_bridge" in all_node_ids:
        if "doc:engineering/tdd" in all_node_ids:
            add_link("doc:engineering/tdd", "module:test_gemini4_bridge", "tests-module", "测试驱动开发实践", 0.75, 80, "rgba(0, 242, 254, 0.5)")
        if "skill:tdd" in all_node_ids:
            add_link("skill:tdd", "module:test_gemini4_bridge", "verifies", "自动化单元测试验证", 0.8, 75, "rgba(179, 136, 255, 0.6)")
        if "skill:setup-pre-commit" in all_node_ids:
            add_link("skill:setup-pre-commit", "module:test_gemini4_bridge", "verifies", "门禁自动化测试套件", 0.7, 85, "rgba(179, 136, 255, 0.5)")

    if "module:quota_readout" in all_node_ids:
        if "doc:engineering/diagnosing-bugs" in all_node_ids:
            add_link("doc:engineering/diagnosing-bugs", "module:quota_readout", "troubleshooting", "排障诊断与额度探测", 0.7, 85, "rgba(0, 242, 254, 0.5)")
        if "skill:diagnosing-bugs" in all_node_ids:
            add_link("skill:diagnosing-bugs", "module:quota_readout", "troubleshooting", "额度读取与排障诊断", 0.7, 85, "rgba(179, 136, 255, 0.5)")

    if "module:agy_unlock_addon" in all_node_ids:
        if "skill:diagnosing-bugs" in all_node_ids:
            add_link("skill:diagnosing-bugs", "module:agy_unlock_addon", "troubleshooting", "网关绕过排障分析", 0.7, 85, "rgba(179, 136, 255, 0.5)")

    if "subsystem:lut-timetable" in all_node_ids:
        if "skill:migrate-to-shoehorn" in all_node_ids:
            add_link("skill:migrate-to-shoehorn", "subsystem:lut-timetable", "type-safety", "TypeScript类型断言治理", 0.75, 80, "rgba(179, 136, 255, 0.5)")

    if "module:run_nebula" in all_node_ids:
        if "doc:engineering/prototype" in all_node_ids:
            add_link("doc:engineering/prototype", "module:run_nebula", "prototype-runtime", "本地轻量交互原型运行", 0.7, 85, "rgba(255, 209, 102, 0.6)")

    return links


def main():
    print("=" * 60)
    print("Cosmic Nebula Asset Scanner & Relationship Mapper")
    print(f"Workspace: {WORKSPACE_ROOT}")
    print("=" * 60)

    # 1. Scan assets
    print("[1/4] Scanning skills (.agents/skills/*/SKILL.md)...")
    skills_nodes, skills_map = scan_skills()
    print(f"      Found {len(skills_nodes)} skills.")

    print("[2/4] Scanning docs (docs/**/*.md)...")
    docs_nodes, docs_map = scan_docs()
    print(f"      Found {len(docs_nodes)} documentation guides.")

    print("[3/4] Scanning modules, subsystems, and specs...")
    module_nodes, module_map = scan_modules_and_specs()
    print(f"      Found {len(module_nodes)} modules/subsystems/specs.")

    all_nodes = skills_nodes + docs_nodes + module_nodes
    print(f"      Total celestial nodes: {len(all_nodes)}")

    # 2. Build links
    print("[4/4] Building relationship topology and gravity filaments...")
    links = build_links(skills_nodes, docs_nodes, module_nodes)
    print(f"      Generated {len(links)} cosmic gravity filaments (edges).")

    # Clean nodes (strip raw content to keep JSON concise)
    for n in all_nodes:
        if "content" in n:
            del n["content"]

    clusters = [
        {
            "id": "galaxy-documents",
            "name": "文档星系",
            "englishName": "Documents Galaxy",
            "color": "#00f2fe",
            "center": {"x": -300, "y": -120},
            "description": "项目设计规范、工程准则与生产力参考文档集合 (29篇)"
        },
        {
            "id": "galaxy-skills",
            "name": "技能星座",
            "englishName": "Skills Constellation",
            "color": "#b388ff",
            "center": {"x": 300, "y": -80},
            "description": ".agents/skills 目录下的全套工程流程与专门技能体系 (39个)"
        },
        {
            "id": "galaxy-modules",
            "name": "模块星轨",
            "englishName": "Modules System",
            "color": "#ffd166",
            "center": {"x": 0, "y": 280},
            "description": "核心网关服务、业务子系统、技术规范与工具套件 (19个)"
        }
    ]

    payload = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "workspaceRoot": WORKSPACE_ROOT.as_posix(),
        "stats": {
            "totalNodes": len(all_nodes),
            "totalSkills": len(skills_nodes),
            "totalDocs": len(docs_nodes),
            "totalModules": len(module_nodes),
            "totalLinks": len(links)
        },
        "clusters": clusters,
        "nodes": all_nodes,
        "links": links
    }

    NEBULA_VIEW_DIR.mkdir(parents=True, exist_ok=True)

    # 3. Write nebula_data.json
    OUTPUT_JSON.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Output saved: {OUTPUT_JSON} ({OUTPUT_JSON.stat().st_size} bytes)")

    # 4. Write nebula_data.js for file:/// protocol support
    js_content = f"/* Auto-generated by scan_nebula_assets.py at {payload['generatedAt']} */\nwindow.NEBULA_DATA = {json.dumps(payload, indent=2, ensure_ascii=False)};\n"
    OUTPUT_JS.write_text(js_content, encoding="utf-8")
    print(f"Output saved: {OUTPUT_JS} ({OUTPUT_JS.stat().st_size} bytes)")

    print("=" * 60)
    print("Scanner complete! Node counts:")
    print(f"  - Skills:    {len(skills_nodes)} (Target: 39)")
    print(f"  - Docs:      {len(docs_nodes)} (Target: 29)")
    print(f"  - Modules:   {len(module_nodes)} (Target: 14+)")
    print(f"  - All Nodes: {len(all_nodes)}")
    print(f"  - All Links: {len(links)}")
    print("=" * 60)


if __name__ == "__main__":
    main()
