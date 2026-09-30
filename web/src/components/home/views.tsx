"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { PROJECTS } from "@/lib/site";

import { ABOUT, EDUCATION, HOME_PROJECTS, INTERESTS, LEADERSHIP, SKILLS_OTHER, SKILLS_TECH, SKILLS_TEXT, WORK, type Role } from "./content";
import { Icon } from "./icons";
import { ProjectCard, ViewLink, type Navigate } from "./parts";

const featured = HOME_PROJECTS.filter((p) => p.featured);
const side = HOME_PROJECTS.filter((p) => !p.featured);

function ViewHead({ id, title, children }: { id: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="view__head">
      <h2 className="view__title" id={`view-${id}-title`} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </div>
  );
}

export function OverviewView({ navigate }: { navigate: Navigate }) {
  const role = WORK.roles[0];
  const college = EDUCATION.college;
  const volunteer = LEADERSHIP[0];
  return (
    <section className="view view--overview" id="view-overview" aria-labelledby="view-overview-title">
      <h2 className="visually-hidden" id="view-overview-title" tabIndex={-1}>
        Overview
      </h2>
      <div className="ov-intro">
        <h3 className="ov-label">About</h3>
        <p className="ov-lead">{ABOUT}</p>
      </div>

      <div className="ov-now">
        <ViewLink className="ncard" view="experience" navigate={navigate}>
          <span className="ncard__label">Current role</span>
          <span className="ncard__title">{role.title}</span>
          <span className="ncard__meta">
            {WORK.org} · {role.dates}
          </span>
          <span className="ncard__fig">
            <b>250,000+</b> <span>views generated</span>
          </span>
          <span className="ncard__cta">
            Experience <Icon.Chevron size={14} />
          </span>
        </ViewLink>
        <ViewLink className="ncard" view="education" navigate={navigate}>
          <span className="ncard__label">Education</span>
          <span className="ncard__title">{college.name}</span>
          <span className="ncard__meta">
            {college.program} · {college.dates}
          </span>
          <span className="ncard__fig">
            <b>{college.gpa}</b> <span>current GPA</span>
          </span>
          <span className="ncard__cta">
            Education <Icon.Chevron size={14} />
          </span>
        </ViewLink>
        <ViewLink className="ncard" view="experience" focus="leadership-title" navigate={navigate}>
          <span className="ncard__label">Volunteering</span>
          <span className="ncard__title">{volunteer.org}</span>
          <span className="ncard__meta">{volunteer.meta}</span>
          <span className="ncard__fig">
            <b>130+</b> <span>volunteer hours</span>
          </span>
          <span className="ncard__cta">
            Leadership <Icon.Chevron size={14} />
          </span>
        </ViewLink>
      </div>

      <div className="ov-projects-block">
        <div className="ov-head">
          <h3>Featured projects</h3>
          <ViewLink className="button button--ghost ov-head__all" view="projects" navigate={navigate}>
            All projects <Icon.Chevron size={14} />
          </ViewLink>
        </div>
        <div className="ov-projects">
          {featured.map((p) => (
            <ProjectCard key={p.id} p={p} variant="feature" navigate={navigate} headingLevel={4} />
          ))}
          {side.map((p) => (
            <ProjectCard key={p.id} p={p} variant="row" navigate={navigate} headingLevel={4} />
          ))}
        </div>
      </div>
    </section>
  );
}

export function ProjectsView({ navigate }: { navigate: Navigate }) {
  return (
    <section className="view view--projects" id="view-projects" aria-labelledby="view-projects-title">
      <ViewHead id="projects" title="Projects">
        <p className="view__dek">{PROJECTS.length} tools, each live on this site with its methodology.</p>
      </ViewHead>
      <div className="proj-grid">
        {HOME_PROJECTS.map((p) => (
          <ProjectCard key={p.id} p={p} variant="full" navigate={navigate} />
        ))}
      </div>
    </section>
  );
}

function RoleItem({ role, open, onToggle }: { role: Role; open: boolean; onToggle: () => void }) {
  const panel = `${role.id}-details`;
  return (
    <li className={"tl__item" + (role.current ? " tl__item--current" : "")}>
      <div className="tl__head">
        <h5 className="tl__title">{role.title}</h5>
        <span className="tl__when">{role.dates}</span>
      </div>
      {role.figures.length > 0 && (
        <ul className="figs" aria-label="Results">
          {role.figures.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
      <button type="button" className="xp-toggle" aria-expanded={open} aria-controls={panel} onClick={onToggle}>
        <Icon.ChevronDown size={14} />
        {open ? "Hide details" : "Show details"}
        <span className="visually-hidden"> for {role.title}</span>
      </button>
      <div className="xp-more" id={panel} hidden={!open}>
        <ul>
          {role.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export function ExperienceView() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const all = WORK.roles.every((r) => open[r.id]);
  return (
    <section className="view view--experience" id="view-experience" aria-labelledby="view-experience-title">
      <ViewHead id="experience" title="Experience & leadership">
        <button
          type="button"
          className="button button--ghost view__tool"
          aria-pressed={all}
          onClick={() => setOpen(Object.fromEntries(WORK.roles.map((r) => [r.id, !all])))}
        >
          {all ? "Collapse all" : "Expand all"}
        </button>
      </ViewHead>
      <div className="xp-grid">
        <section className="xp-col" aria-labelledby="work-title">
          <h3 className="xp-col__title" id="work-title">
            Work
          </h3>
          <div className="xp-org">
            <div className="xp-org__head">
              <h4>{WORK.org}</h4>
              <span>
                {WORK.where} · {WORK.dates}
              </span>
            </div>
            <ol className="tl">
              {WORK.roles.map((r) => (
                <RoleItem key={r.id} role={r} open={Boolean(open[r.id])} onToggle={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))} />
              ))}
            </ol>
          </div>
        </section>
        <section className="xp-col" aria-labelledby="leadership-title">
          <h3 className="xp-col__title" id="leadership-title" tabIndex={-1}>
            Leadership &amp; volunteering
          </h3>
          <ol className="tl tl--plain">
            {LEADERSHIP.map((l) => (
              <li key={l.org} className="tl__item">
                <h4 className="tl__title">{l.org}</h4>
                <span className="tl__when">{l.meta}</span>
                <p className="tl__text">{l.detail}</p>
                {l.figure && (
                  <ul className="figs" aria-label="Result">
                    <li>{l.figure}</li>
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </section>
  );
}

export function EducationView() {
  const c = EDUCATION.college;
  const s = EDUCATION.school;
  return (
    <section className="view view--education" id="view-education" aria-labelledby="view-education-title">
      <ViewHead id="education" title="Education" />
      <div className="edu-grid">
        <article className="edu-card edu-card--main" aria-labelledby="edu-college">
          <div className="edu-card__head">
            <div>
              <h3 id="edu-college">{c.name}</h3>
              <p className="edu-card__meta">
                {c.where} · {c.dates}
              </p>
            </div>
            <p className="edu-gpa">
              <b>{c.gpa}</b>
              <span>Current GPA</span>
            </p>
          </div>
          <dl className="edu-facts">
            <div>
              <dt>Program</dt>
              <dd>{c.program}</dd>
            </div>
            <div>
              <dt>Coursework</dt>
              <dd>
                <ul className="hchips">
                  {c.coursework.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </dd>
            </div>
          </dl>
        </article>
        <article className="edu-card" aria-labelledby="edu-school">
          <h3 id="edu-school">{s.name}</h3>
          <p className="edu-card__meta">
            {s.where} · {s.dates}
          </p>
        </article>
      </div>
    </section>
  );
}

export function SkillsView() {
  const byId = Object.fromEntries(HOME_PROJECTS.map((p) => [p.id, p]));
  return (
    <section className="view view--skills" id="view-skills" aria-labelledby="view-skills-title">
      <ViewHead id="skills" title="Skills & interests" />
      <div className="skills-grid">
        <div className="skills-tech">
          <h3 className="skills-h">Technical</h3>
          <table className="skills-table">
            <caption className="visually-hidden">Technical skills and the projects on this site that use them</caption>
            <thead>
              <tr>
                <th scope="col">Skill</th>
                <th scope="col">Used in</th>
              </tr>
            </thead>
            {SKILLS_TECH.map((g) => (
              <tbody key={g.group}>
                <tr className="skills-table__group">
                  <th scope="colgroup" colSpan={2}>
                    {g.group}
                  </th>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.skill}>
                    <th scope="row">{r.skill}</th>
                    <td>
                      {r.used.length ? (
                        <ul className="skills-used">
                          {r.used.map((id) => (
                            <li key={id}>
                              <Link className="button button--small" href={byId[id].href as Route}>
                                {byId[id].short}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="faint" aria-label="Not listed on a project">
                          –
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          <p className="print-only skills-print">
            <b>Technical:</b> {SKILLS_TEXT.technical}
          </p>
        </div>
        <div className="skills-side">
          <div className="skills-card">
            <h3 className="skills-h">Other</h3>
            <ul className="hchips">
              {SKILLS_OTHER.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="print-only skills-print">
              <b>Other:</b> {SKILLS_TEXT.other}
            </p>
          </div>
          <div className="skills-card">
            <h3 className="skills-h">Interests</h3>
            <ul className="hchips">
              {INTERESTS.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p className="print-only skills-print">
              <b>Interests:</b> {SKILLS_TEXT.interests}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
