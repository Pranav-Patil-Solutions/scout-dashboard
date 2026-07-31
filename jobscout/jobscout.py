#!/usr/bin/env python3
"""Job Scout — paste a JD, get a tailored CV + cover letter in the navy/stone design,
and track the application. Content lives in profile.py; per-job tailoring in jobs/<slug>.json.

Usage:
  python jobscout.py build   <slug>                 # build CV + cover letter, log to tracker
  python jobscout.py scout    --slug S --company C --role R --location L --url U
                                                    # log a discovered role (status=new, no docs)
  python jobscout.py status  <slug> <new_status>    # update status (applied/interview/rejected/offer)
  python jobscout.py list                           # print the tracker

Statuses: new -> to_apply -> applied -> interview -> offer / rejected
"""
import argparse
import csv
import datetime
import json
import os
import sys

import profile
import render

HERE = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(HERE, "jobs")
TRACKER = os.path.join(HERE, "applications.csv")
OUT_ROOT = os.path.expanduser("~/Desktop/Applications")

FIELDS = ["slug", "company", "role", "location", "status", "job_url",
          "added_date", "applied_date", "cv_path", "cl_path", "notes"]


def today():
    return datetime.date.today().isoformat()


def load_tracker():
    if not os.path.exists(TRACKER):
        return []
    with open(TRACKER, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save_tracker(rows):
    with open(TRACKER, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


def upsert(row):
    rows = load_tracker()
    for i, r in enumerate(rows):
        if r["slug"] == row["slug"]:
            merged = {**r, **{k: v for k, v in row.items() if v not in (None, "")}}
            rows[i] = merged
            save_tracker(rows)
            return
    rows.append(row)
    save_tracker(rows)


def load_job(slug):
    path = os.path.join(JOBS_DIR, f"{slug}.json")
    if not os.path.exists(path):
        sys.exit(f"No job spec at {path}")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cmd_build(args):
    job = load_job(args.slug)
    company = job.get("company", args.slug)
    out_dir = os.path.join(OUT_ROOT, args.slug)
    os.makedirs(out_dir, exist_ok=True)
    safe = company.replace(" ", "-").replace("/", "-")
    cv_path = os.path.join(out_dir, f"Pranav-Patil-CV-{safe}.docx")
    cl_path = os.path.join(out_dir, f"Pranav-Patil-CoverLetter-{safe}.docx")

    render.build_cv(profile, job, cv_path)
    print(f"  CV           -> {cv_path}")
    if job.get("cover_letter"):
        render.build_cover_letter(profile, job, cl_path)
        print(f"  Cover letter -> {cl_path}")
    else:
        cl_path = ""
        print("  (no cover_letter block in spec — skipped)")

    existing = {r["slug"]: r for r in load_tracker()}.get(args.slug, {})
    upsert({
        "slug": args.slug,
        "company": company,
        "role": job.get("role", ""),
        "location": job.get("location", ""),
        "status": job.get("status") or existing.get("status") or "to_apply",
        "job_url": job.get("job_url", existing.get("job_url", "")),
        "added_date": existing.get("added_date") or today(),
        "applied_date": existing.get("applied_date", ""),
        "cv_path": cv_path,
        "cl_path": cl_path,
        "notes": job.get("notes", existing.get("notes", "")),
    })
    print(f"  tracked      -> {TRACKER}")


def cmd_scout(args):
    upsert({
        "slug": args.slug, "company": args.company, "role": args.role,
        "location": args.location, "status": "new", "job_url": args.url,
        "added_date": today(), "applied_date": "", "cv_path": "", "cl_path": "",
        "notes": args.notes or "",
    })
    print(f"scouted: {args.company} — {args.role} [new]")


def cmd_status(args):
    rows = load_tracker()
    for r in rows:
        if r["slug"] == args.slug:
            r["status"] = args.new_status
            if args.new_status == "applied" and not r.get("applied_date"):
                r["applied_date"] = today()
            save_tracker(rows)
            print(f"{args.slug}: status -> {args.new_status}")
            return
    sys.exit(f"slug '{args.slug}' not in tracker")


def cmd_list(args):
    rows = load_tracker()
    if not rows:
        print("tracker empty"); return
    order = {"new": 0, "to_apply": 1, "applied": 2, "interview": 3, "offer": 4, "rejected": 5}
    rows.sort(key=lambda r: (order.get(r["status"], 9), r["company"]))
    w = max(len(r["company"]) for r in rows)
    print(f"{'STATUS':<10} {'COMPANY':<{w}}  ROLE")
    print("-" * (12 + w + 30))
    for r in rows:
        print(f"{r['status']:<10} {r['company']:<{w}}  {r['role']}")
    print(f"\n{len(rows)} roles tracked  ·  {TRACKER}")


def main():
    ap = argparse.ArgumentParser(description="Job Scout: tailored CV + cover letter + tracker")
    sub = ap.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build"); b.add_argument("slug"); b.set_defaults(fn=cmd_build)

    s = sub.add_parser("scout")
    s.add_argument("--slug", required=True); s.add_argument("--company", required=True)
    s.add_argument("--role", required=True); s.add_argument("--location", default="Berlin")
    s.add_argument("--url", default=""); s.add_argument("--notes", default="")
    s.set_defaults(fn=cmd_scout)

    st = sub.add_parser("status"); st.add_argument("slug"); st.add_argument("new_status")
    st.set_defaults(fn=cmd_status)

    ls = sub.add_parser("list"); ls.set_defaults(fn=cmd_list)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
