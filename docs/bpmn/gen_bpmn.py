#!/usr/bin/env python3
"""Write the four ULMs collaborations to .bpmn files.

    python3 gen_bpmn.py            # -> docs/bpmn/*.bpmn
"""

from pathlib import Path

from bpmn_data import DIAGRAMS

HERE = Path(__file__).resolve().parent


def main() -> None:
    issues = 0
    for name, build in DIAGRAMS.items():
        collab = build()
        for problem in collab.check():
            print(f"  ! {name}: {problem}")
            issues += 1
        xml = collab.to_xml()
        path = HERE / f"{name}.bpmn"
        path.write_text(xml, encoding="utf-8")
        n_nodes = sum(len(p.nodes) for p in collab.pools)
        n_flows = sum(len(p.flows) for p in collab.pools)
        print(
            f"{path.name:20s} {collab.width:5.0f}px  "
            f"{len(collab.pools)} pools  {n_nodes:2d} nodes  "
            f"{n_flows:2d} sequence flows  {len(collab.messages)} message flows"
        )
    if issues:
        raise SystemExit(f"{issues} routing collision(s) -- fix the grid in bpmn_data.py")


if __name__ == "__main__":
    main()
