import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  meta?: ReactNode;
  actions?: ReactNode;
};

export function TurnoPageHeader({ eyebrow, title, description, meta, actions }: PageHeaderProps) {
  return (
    <header className="gh-turno-header">
      <div className="gh-turno-header__copy">
        <p className="gh-turno-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="gh-turno-description">{description}</p>
        {meta ? <div className="gh-turno-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="gh-turno-header__actions">{actions}</div> : null}
    </header>
  );
}

export function TurnoSectionTitle({
  eyebrow,
  title,
  description,
  aside,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="gh-turno-section-title">
      <div>
        {eyebrow ? <p className="gh-turno-eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {aside ? <div className="gh-turno-section-title__aside">{aside}</div> : null}
    </div>
  );
}

export function TurnoMetric({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="gh-turno-metric">
      <div className="gh-turno-metric__top">
        <span>{label}</span>
        {icon ? <span className="gh-turno-metric__icon" aria-hidden="true">{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

export function TurnoSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`gh-turno-surface ${className}`.trim()}>{children}</section>;
}

export function TurnoEmpty({ title, description }: { title: string; description?: string }) {
  return (
    <div className="gh-turno-empty">
      <span aria-hidden="true" />
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
