from datetime import UTC, datetime
from html import escape

from app.modules.books.narrative import BookNarrative

_FACT_TYPE_RU = {
    "BIRTH": "Рождение",
    "DEATH": "Смерть",
    "MARRIAGE": "Брак",
    "RESIDENCE": "Проживание",
    "SERVICE": "Служба",
    "NOTE": "Заметка",
}
_CONFIDENCE_RU = {
    "UNVERIFIED": "Не проверено",
    "HYPOTHESIS": "Гипотеза",
    "PROBABLE": "Вероятно",
    "CONFIRMED": "Подтверждено",
}


def _safe(value) -> str:
    return escape(str(value), quote=True)


def _paragraphs(value: str) -> str:
    parts = [part.strip() for part in value.split("\n\n") if part.strip()]
    return "".join(f"<p>{_safe(part)}</p>" for part in parts)


def _format_date(value: str | None) -> str:
    if not value:
        return "Не указано"
    year, month, day = value.split("-")
    return f"{day}.{month}.{year}"


def _life_years(person: dict) -> str:
    birth = person["birth_date"][:4] if person["birth_date"] else None
    death = person["death_date"][:4] if person["death_date"] else None
    if death:
        return f"{birth or '?'} - {death}"
    if person["is_living"] and birth:
        return birth
    if not person["is_living"] and birth:
        return f"{birth} - ?"
    return "-"


def _fact_table(facts: list[dict]) -> str:
    if not facts:
        return '<p class="empty">Дополнительные события и свидетельства не добавлены.</p>'

    rows = []
    for fact in facts:
        confidence = fact["confidence"]
        description = fact["description"] or fact["notes"] or "—"
        rows.append(
            "<tr>"
            f"<td>{_safe(_format_date(fact['date']))}</td>"
            f"<td>{_safe(_FACT_TYPE_RU.get(fact['type'], fact['type']))}</td>"
            f"<td>{_safe(fact['place'] or '—')}</td>"
            f"<td>{_safe(description)}</td>"
            f"<td><span class='confidence confidence-{_safe(confidence.lower())}'>"
            f"{_safe(_CONFIDENCE_RU.get(confidence, confidence))}</span></td>"
            "</tr>"
        )
    return (
        "<div class='table-wrap'><table><thead><tr>"
        "<th>Дата</th><th>Событие</th><th>Место</th><th>Сведения</th>"
        "<th>Достоверность</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table></div>"
    )


def render_book_html(source: dict, narrative: BookNarrative) -> str:
    profile = source["profile"]
    persons_by_id = {person["id"]: person for person in source["persons"]}
    generated_at = datetime.now(UTC).strftime("%d.%m.%Y")
    generation_label = (
        "Повествование подготовлено с помощью YandexGPT "
        "и проверено структурными ограничениями."
        if narrative.generated_by_ai
        else "Повествование сформировано автоматически без использования AI."
    )

    toc = []
    chapters = []
    for index, chapter in enumerate(narrative.chapters, start=1):
        person = persons_by_id[chapter.person_id]
        anchor = f"person-{index}"
        toc.append(
            f"<li><a href='#{anchor}'>{_safe(chapter.title)}</a>"
            f"<span>{_safe(_life_years(person))}</span></li>"
        )

        details = [
            ("Дата рождения", _format_date(person["birth_date"])),
            ("Место рождения", person["birth_place"] or "Не указано"),
        ]
        if not person["is_living"] or person["death_date"] or person["death_place"]:
            details.extend(
                [
                    ("Дата смерти", _format_date(person["death_date"])),
                    ("Место смерти", person["death_place"] or "Не указано"),
                ]
            )
        detail_html = "".join(
            f"<div><dt>{_safe(label)}</dt><dd>{_safe(value)}</dd></div>" for label, value in details
        )

        relations = person["relationships"]
        relation_html = (
            "".join(f"<span class='relation'>{_safe(item)}</span>" for item in relations)
            if relations
            else "<span class='empty'>Родственные связи не указаны.</span>"
        )

        chapters.append(
            f"<article class='chapter' id='{anchor}'>"
            f"<div class='chapter-number'>Глава {index}</div>"
            f"<h2>{_safe(chapter.title)}</h2>"
            f"<div class='years'>{_safe(_life_years(person))}</div>"
            f"<p class='lead'>{_safe(chapter.lead)}</p>"
            f"<div class='narrative'>{_paragraphs(chapter.narrative)}</div>"
            "<section class='person-data'><h3>Основные сведения</h3>"
            f"<dl>{detail_html}</dl></section>"
            "<section><h3>Место в семье</h3>"
            f"<div class='relations'>{relation_html}</div></section>"
            "<section><h3>Хроника и источники сведений</h3>"
            f"{_fact_table(person['facts'])}</section>"
            "</article>"
        )

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_safe(narrative.title)}</title>
  <style>
    :root{{--ink:#292524;--muted:#78716c;--paper:#fffcf5;--accent:#7c3f2c;
      --accent-soft:#efe2d4;--line:#ded4c8;--green:#336b56}}
    *{{box-sizing:border-box}}
    body{{margin:0;background:#e9e4dc;color:var(--ink);font-family:Georgia,"Times New Roman",serif;
      font-size:17px;line-height:1.72}}
    .book{{max-width:920px;margin:32px auto;background:var(--paper);
      box-shadow:0 18px 60px rgba(54,43,35,.16)}}
    .cover{{min-height:720px;padding:110px 88px;display:flex;flex-direction:column;
      justify-content:center;text-align:center;border:18px solid var(--accent-soft);
      outline:1px solid var(--line);
      outline-offset:-34px}}
    .eyebrow,.chapter-number{{font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:.18em;
      color:var(--accent);font-size:12px;font-weight:700}}
    h1{{font-size:54px;line-height:1.1;margin:28px 0 20px;font-weight:500}}
    .subtitle{{font-size:23px;color:var(--muted);font-style:italic}}
    .cover-meta{{margin-top:70px;color:var(--muted);font-family:Arial,sans-serif;font-size:13px}}
    .content{{padding:72px 88px}}
    h2{{font-size:36px;line-height:1.2;margin:10px 0 4px;font-weight:500}}
    h3{{font-family:Arial,sans-serif;font-size:15px;letter-spacing:.04em;margin:34px 0 12px}}
    .intro{{font-size:20px;border-left:4px solid var(--accent);padding-left:24px;
      margin:28px 0 56px}}
    .toc{{list-style:none;padding:0;margin:20px 0 72px;border-top:1px solid var(--line)}}
    .toc li{{display:flex;justify-content:space-between;gap:20px;padding:12px 0;
      border-bottom:1px solid var(--line)}}
    .toc a{{color:var(--ink);text-decoration:none}}.toc span{{color:var(--muted)}}
    .chapter{{padding:72px 0;border-top:2px solid var(--accent);page-break-before:always}}
    .chapter:first-of-type{{page-break-before:auto}}
    .years{{color:var(--muted);font-family:Arial,sans-serif;font-size:14px}}
    .lead{{font-size:20px;font-style:italic;color:var(--accent);margin:22px 0}}
    .narrative p{{margin:0 0 18px}}
    dl{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:0}}
    dl div{{padding:14px 16px;background:#f8f3eb;border-radius:8px}}
    dt{{font-family:Arial,sans-serif;color:var(--muted);font-size:11px;text-transform:uppercase;
      letter-spacing:.06em}}dd{{margin:3px 0 0}}
    .relations{{display:flex;flex-wrap:wrap;gap:8px}}
    .relation{{font-family:Arial,sans-serif;font-size:13px;background:var(--accent-soft);
      color:#653524;padding:6px 10px;border-radius:999px}}
    .table-wrap{{overflow-x:auto}}table{{border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px}}
    th,td{{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid var(--line)}}
    th{{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em}}
    .confidence{{white-space:nowrap}}.confidence-confirmed{{color:var(--green)}}
    .confidence-hypothesis,.confidence-unverified{{color:#a16207}}.empty{{color:var(--muted);font-style:italic}}
    .afterword{{margin-top:72px;padding-top:28px;border-top:1px solid var(--line);
      color:var(--muted);font-family:Arial,sans-serif;font-size:12px}}
    @media(max-width:720px){{.book{{margin:0}}.cover,.content{{padding:56px 28px}}
      h1{{font-size:39px}}
      dl{{grid-template-columns:1fr}}}}
    @media print{{body{{background:#fff}}.book{{margin:0;max-width:none;box-shadow:none}}
      .cover{{min-height:95vh}}a{{color:inherit}}}}
  </style>
</head>
<body>
  <main class="book">
    <section class="cover">
      <div class="eyebrow">Генеалогическое исследование</div>
      <h1>{_safe(narrative.title)}</h1>
      <div class="subtitle">{_safe(narrative.subtitle)}</div>
      <div class="cover-meta">{_safe(profile["title"])} · {generated_at}</div>
    </section>
    <div class="content">
      <section>
        <div class="eyebrow">О книге</div>
        <div class="intro">{_paragraphs(narrative.introduction)}</div>
      </section>
      <section>
        <div class="eyebrow">Содержание</div>
        <ol class="toc">{"".join(toc)}</ol>
      </section>
      {"".join(chapters)}
      <footer class="afterword">
        <strong>Примечание.</strong> {_safe(generation_label)}
        AI-текст может содержать редакционные неточности и должен сверяться
        с первичными источниками.
        Непроверенные сведения обозначены в хронике отдельно.
      </footer>
    </div>
  </main>
</body>
</html>"""
