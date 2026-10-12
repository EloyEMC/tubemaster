# TubeMaster — bug report issue form

## Status

- State: complete
- Branch: `chore/bug-report-form`
- Base: `upstream/feature-2`

## Scope

Add a conforming YAML GitHub issue form for reproducible product bugs. This unblocks publication of the broken channel-thumbnail issue without using an unsupported Markdown or blank issue body.

## Tasks

- [x] Add the bug-report YAML form following repository issue-form conventions.
- [x] Validate the form structure and diff.
- [x] Commit the focused work unit; do not push or open a PR.

## Validation

- `python3 -c 'import yaml; from pathlib import Path; root=Path(".github/ISSUE_TEMPLATE"); bug=yaml.safe_load((root/"bug-report.yml").read_text()); npm=yaml.safe_load((root/"npm-warnings.yml").read_text()); assert all(isinstance(bug[k],type(npm[k])) for k in ("name","description","title","body")); assert isinstance(bug["labels"],list) and all(isinstance(x,str) for x in bug["labels"]); ids=[x["id"] for x in bug["body"]]; assert len(ids)==len(set(ids)); assert all(x["type"] in ("textarea","checkboxes") and isinstance(x["attributes"]["label"],str) for x in bug["body"]); assert all(isinstance(x.get("validations",{}).get("required"),bool) for x in bug["body"] if x["type"]=="textarea"); assert all(isinstance(o["required"],bool) for x in bug["body"] if x["type"]=="checkboxes" for o in x["attributes"]["options"]); print("PASS: both YAML files parse; bug form matches npm-warnings field/section conventions, unique IDs, valid required flags")'`: PASS: both YAML files parse; bug form matches npm-warnings field/section conventions, unique IDs, valid required flags.
- `git diff --check`: PASS (no output).
