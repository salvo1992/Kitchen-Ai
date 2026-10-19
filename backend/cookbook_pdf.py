from io import BytesIO
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak


def render_cookbook(title, dedication, recipes):
    data = BytesIO()
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle('KitchenTitle', parent=styles['Title'], fontSize=27, leading=34, textColor=colors.HexColor('#3A6950'), spaceAfter=24))
    styles.add(ParagraphStyle('KitchenBody', parent=styles['BodyText'], fontSize=11, leading=17, spaceAfter=10))
    safe = lambda x: escape(str(x or '')).replace('\n', '<br/>')
    story = [Spacer(1, 100), Paragraph(safe(title), styles['KitchenTitle']),
        Paragraph('Smart Kitchen AI · Ricettario di famiglia', styles['Heading2']), Spacer(1, 28)]
    if dedication:
        story.append(Paragraph(safe(dedication), styles['KitchenBody']))
    story += [Spacer(1, 30), Paragraph(f'{len(recipes)} ricette da conservare e condividere', styles['KitchenBody']), PageBreak()]
    story.append(Paragraph('Le nostre ricette', styles['Heading1']))
    for index, recipe in enumerate(recipes, 1):
        story.append(Paragraph(f"{index}. {safe(recipe.get('title'))}", styles['KitchenBody']))
    for recipe in recipes:
        story += [PageBreak(), Paragraph(safe(recipe.get('title')), styles['KitchenTitle']),
            Paragraph(f"{safe(recipe.get('servings', 2))} porzioni · {safe(recipe.get('time_min', 30))} minuti", styles['Heading3'])]
        if recipe.get('description'):
            story.append(Paragraph(safe(recipe['description']), styles['KitchenBody']))
        story.append(Paragraph('Ingredienti', styles['Heading2']))
        for ingredient in recipe.get('ingredients', []):
            line = f"{ingredient.get('qty', '')} {ingredient.get('unit', '')} · {ingredient.get('name', '')}" if isinstance(ingredient, dict) else str(ingredient)
            story.append(Paragraph(safe(line), styles['KitchenBody']))
        story.append(Paragraph('Preparazione', styles['Heading2']))
        for i, step in enumerate(recipe.get('steps', []), 1):
            story.append(Paragraph(f'{i}. {safe(step)}', styles['KitchenBody']))
        if recipe.get('notes'):
            story += [Paragraph('Il nostro tocco', styles['Heading2']), Paragraph(safe(recipe['notes']), styles['KitchenBody'])]
    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont('Helvetica', 9)
        canvas.setFillColor(colors.grey)
        canvas.drawString(48, 28, 'Smart Kitchen AI · Ricette di casa')
        canvas.drawRightString(A4[0] - 48, 28, str(document.page))
        canvas.restoreState()
    SimpleDocTemplate(data, pagesize=A4, title=title, author='Smart Kitchen AI', leftMargin=48, rightMargin=48,
        topMargin=48, bottomMargin=48).build(story, onFirstPage=footer, onLaterPages=footer)
    return data.getvalue()