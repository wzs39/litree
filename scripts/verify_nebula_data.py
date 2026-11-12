#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_nebula_data.py
Automated Quality Gate 1: Data and Parse Integrity Verification for Nebula Graph View.
Asserts:
1. Output files exist: nebula_view/nebula_data.json and nebula_view/nebula_data.js.
2. Node counts strictly match filesystem actuals:
   - 29 docs under docs/**/*.md
   - 39 skills under .agents/skills/*/SKILL.md
   - 14+ modules/subsystems/specs
   - Total nodes >= 82
3. Schema integrity: Every node has id, name, type, cluster, path, description, tags, size, color, isHub, metadata.
4. Real physical paths: Every node's path exists on disk (os.path.exists).
5. Zero dangling links: Every link source and target exists in the node registry.
6. Twin relation integrity: Key doc <-> skill 1:1 correspondences exist (e.g. ask-matt, codebase-design, tdd).
"""

import os
import sys
import json
import glob
from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
DATA_JSON = WORKSPACE_ROOT / "nebula_view" / "nebula_data.json"
DATA_JS = WORKSPACE_ROOT / "nebula_view" / "nebula_data.js"

class VerificationError(Exception):
    pass

def log_check(name: str, passed: bool, detail: str = ""):
    mark = "✓ PASS" if passed else "✗ FAIL"
    print(f"[{mark}] {name}: {detail}")
    if not passed:
        raise VerificationError(f"Check failed: {name} - {detail}")

def main():
    print("=" * 70)
    print("NEBULA GRAPH DATA INTEGRITY VERIFICATION (GATE 1)")
    print(f"Workspace: {WORKSPACE_ROOT}")
    print("=" * 70)

    # 1. Verify file existence
    log_check("File Existence: JSON", DATA_JSON.exists(), str(DATA_JSON))
    log_check("File Existence: JS", DATA_JS.exists(), str(DATA_JS))
    log_check("File Non-Empty: JSON", DATA_JSON.stat().st_size > 1000, f"{DATA_JSON.stat().st_size} bytes")
    log_check("File Non-Empty: JS", DATA_JS.stat().st_size > 1000, f"{DATA_JS.stat().st_size} bytes")

    # 2. Parse JSON
    try:
        data = json.loads(DATA_JSON.read_text(encoding="utf-8"))
        log_check("JSON Parse", True, "Successfully parsed valid JSON")
    except Exception as e:
        log_check("JSON Parse", False, f"JSON decode error: {e}")

    # 3. Parse JS and verify alignment
    js_text = DATA_JS.read_text(encoding="utf-8")
    log_check("JS Header Check", "window.NEBULA_DATA = " in js_text, "Contains window.NEBULA_DATA definition")
    try:
        raw_js_json = js_text.split("window.NEBULA_DATA = ", 1)[1].rsplit(";", 1)[0].strip()
        js_data = json.loads(raw_js_json)
        log_check("JS-JSON Sync", js_data["stats"]["totalNodes"] == data["stats"]["totalNodes"], 
                  f"Both have {data['stats']['totalNodes']} nodes")
    except Exception as e:
        log_check("JS-JSON Sync", False, f"Failed to parse JS payload: {e}")

    # 4. Compare with filesystem actuals
    fs_docs = glob.glob(str(WORKSPACE_ROOT / "docs" / "**" / "*.md"), recursive=True)
    fs_skills = [p for p in glob.glob(str(WORKSPACE_ROOT / ".agents" / "skills" / "*" / "SKILL.md"))]
    fs_root_py = glob.glob(str(WORKSPACE_ROOT / "*.py"))

    nodes = data.get("nodes", [])
    links = data.get("links", [])
    clusters = data.get("clusters", [])

    doc_nodes = [n for n in nodes if n.get("type") == "document"]
    skill_nodes = [n for n in nodes if n.get("type") == "skill"]
    module_nodes = [n for n in nodes if n.get("type") in ("module", "subsystem", "spec")]

    log_check("Cluster Count", len(clusters) >= 3, f"Found {len(clusters)} clusters")
    log_check("Docs Count", len(doc_nodes) == len(fs_docs), 
              f"Parsed {len(doc_nodes)} == FS actual {len(fs_docs)} (Expected 29)")
    log_check("Skills Count", len(skill_nodes) == len(fs_skills), 
              f"Parsed {len(skill_nodes)} == FS actual {len(fs_skills)} (Expected 39)")
    log_check("Modules Count", len(module_nodes) >= 14, 
              f"Parsed {len(module_nodes)} modules/subsystems/specs (Expected >= 14)")
    log_check("Total Nodes Count", len(nodes) >= 82, 
              f"Parsed {len(nodes)} nodes total (Expected >= 82)")

    # 5. Schema integrity check on all nodes
    required_node_keys = ["id", "name", "type", "category", "cluster", "path", "description", "tags", "size", "color", "isHub", "metadata"]
    node_id_map = {}

    for idx, node in enumerate(nodes):
        nid = node.get("id")
        if not nid:
            raise VerificationError(f"Node at index {idx} missing 'id'")
        if nid in node_id_map:
            raise VerificationError(f"Duplicate node id '{nid}'")
        node_id_map[nid] = node

        for rk in required_node_keys:
            if rk not in node:
                raise VerificationError(f"Node '{nid}' missing required key '{rk}'")

        # 6. Physical path existence check (Zero fake paths)
        rel_path = node["path"]
        full_path = WORKSPACE_ROOT / rel_path
        if not full_path.exists():
            raise VerificationError(f"Node '{nid}' references non-existent physical path: '{rel_path}'")

    log_check("Node Schema Integrity", True, f"All {len(nodes)} nodes have complete required keys")
    log_check("Physical Path Existence", True, f"All {len(nodes)} node paths exist on disk (100% verified)")

    # 7. Zero dangling links check
    log_check("Link Count", len(links) >= 100, f"Found {len(links)} links (Expected >= 100)")
    required_link_keys = ["source", "target", "type", "label", "strength", "distance", "color"]

    for idx, link in enumerate(links):
        for lk in required_link_keys:
            if lk not in link:
                raise VerificationError(f"Link at index {idx} missing required key '{lk}'")

        src = link["source"]
        tgt = link["target"]

        if src not in node_id_map:
            raise VerificationError(f"Dangling link source '{src}' at index {idx}")
        if tgt not in node_id_map:
            raise VerificationError(f"Dangling link target '{tgt}' at index {idx}")

    log_check("Zero Dangling Links", True, f"All {len(links)} links have valid source and target nodes")

    # 8. Twin relation check (Doc <-> Skill correspondence)
    corresp_links = [l for l in links if l.get("type") == "corresponds-to"]
    log_check("1:1 Twin Correspondences", len(corresp_links) >= 25, 
              f"Found {len(corresp_links)} twin links (Expected >= 25)")

    sample_twins = [
        ("doc:engineering/ask-matt", "skill:ask-matt"),
        ("doc:engineering/codebase-design", "skill:codebase-design"),
        ("doc:engineering/tdd", "skill:tdd"),
        ("doc:engineering/code-review", "skill:matt-code-review")
    ]
    for doc_id, skill_id in sample_twins:
        twin_found = any(
            (l["source"] == doc_id and l["target"] == skill_id) or 
            (l["source"] == skill_id and l["target"] == doc_id)
            for l in corresp_links
        )
        log_check(f"Specific Twin: {doc_id} <-> {skill_id}", twin_found, "Verified")

    # 9. Zero false-positive skill:pr links (Regression test for substring collision)
    spurious_pr_sources = {
        "doc:engineering/ask-matt",
        "doc:engineering/codebase-design",
        "doc:engineering/prototype",
        "doc:engineering/research",
        "doc:engineering/resolving-merge-conflicts",
        "doc:productivity/handoff",
        "doc:productivity/teach",
        "doc:productivity/writing-for-agents"
    }
    pr_references = [
        l["source"] for l in links 
        if l.get("target") == "skill:pr" and l.get("type") == "references" and l.get("source") in spurious_pr_sources
    ]
    log_check("Zero False-Positive PR Links", len(pr_references) == 0, 
              f"Found {len(pr_references)} false PR references (Expected 0)")

    # 10. Modules Galaxy Inter-Cluster Connectivity
    node_cluster_map = {n["id"]: n["cluster"] for n in nodes}
    inter_cluster_edges = [
        l for l in links 
        if node_cluster_map.get(l["source"]) != node_cluster_map.get(l["target"])
    ]
    modules_inter_edges = [
        l for l in inter_cluster_edges
        if "galaxy-modules" in (node_cluster_map.get(l["source"]), node_cluster_map.get(l["target"]))
    ]
    log_check("Modules Galaxy Inter-Cluster Connectivity", len(modules_inter_edges) >= 10,
              f"Found {len(modules_inter_edges)} cross-cluster edges connected to galaxy-modules (Expected >= 10)")

    # 11. Zero isolated celestial bodies
    connected_nodes = set()
    for l in links:
        connected_nodes.add(l["source"])
        connected_nodes.add(l["target"])
    isolated = [n["id"] for n in nodes if n["id"] not in connected_nodes]
    log_check("Zero Isolated Celestial Bodies", len(isolated) == 0,
              f"Found {len(isolated)} isolated nodes (Expected 0)")

    print("=" * 70)
    print("ALL GATE 1 VERIFICATION CHECKS PASSED PERFECTLY (EXIT CODE 0)")
    print(f"Summary: {len(nodes)} Nodes, {len(links)} Edges, {len(clusters)} Clusters verified.")
    print("=" * 70)

if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except VerificationError as ve:
        print(f"\n[FATAL GATE 1 FAILURE] {ve}", file=sys.stderr)
        sys.exit(1)
    except Exception as ex:
        print(f"\n[UNEXPECTED ERROR] {ex}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
