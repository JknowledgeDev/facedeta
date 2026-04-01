"""
สร้าง PDF คู่มือ FaceDeta 3 ฉบับ
"""
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

# ── Register Thai fonts ────────────────────────────────────────────────────────
FONT_DIR = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("Thai",     FONT_DIR + "leelawad.ttf"))
pdfmetrics.registerFont(TTFont("ThaiBold", FONT_DIR + "leelawdb.ttf"))
pdfmetrics.registerFont(TTFont("ThaiThin", FONT_DIR + "LeelawUI.ttf"))

# ── Color palette (green theme) ────────────────────────────────────────────────
C_GREEN      = colors.HexColor("#16a34a")
C_GREEN_DARK = colors.HexColor("#15803d")
C_GREEN_LIGHT= colors.HexColor("#dcfce7")
C_EMERALD    = colors.HexColor("#059669")
C_AMBER      = colors.HexColor("#d97706")
C_AMBER_LIGHT= colors.HexColor("#fef3c7")
C_RED        = colors.HexColor("#dc2626")
C_RED_LIGHT  = colors.HexColor("#fee2e2")
C_BLUE       = colors.HexColor("#2563eb")
C_BLUE_LIGHT = colors.HexColor("#dbeafe")
C_GRAY       = colors.HexColor("#6b7280")
C_GRAY_LIGHT = colors.HexColor("#f3f4f6")
C_DARK       = colors.HexColor("#111827")
C_WHITE      = colors.white

W, H = A4  # 595 x 842 pts

# ── Base styles ────────────────────────────────────────────────────────────────
def S(name, **kw):
    kw.setdefault("fontName", "Thai")
    return ParagraphStyle(name, **kw)

sTitle    = S("sTitle",    fontSize=28, leading=36, textColor=C_WHITE,   alignment=TA_CENTER, spaceAfter=6)
sSubtitle = S("sSubtitle", fontSize=14, leading=20, textColor=C_GREEN_LIGHT, alignment=TA_CENTER)
sH1       = S("sH1",       fontSize=20, leading=26, textColor=C_GREEN_DARK, fontName="ThaiBold", spaceBefore=18, spaceAfter=8)
sH2       = S("sH2",       fontSize=15, leading=22, textColor=C_DARK, fontName="ThaiBold", spaceBefore=14, spaceAfter=6)
sH3       = S("sH3",       fontSize=13, leading=20, textColor=C_EMERALD, fontName="ThaiBold", spaceBefore=10, spaceAfter=4)
sBody     = S("sBody",     fontSize=12, leading=20, textColor=C_DARK, spaceAfter=6)
sBodySm   = S("sBodySm",  fontSize=11, leading=18, textColor=C_GRAY, spaceAfter=4)
sNum      = S("sNum",      fontSize=12, leading=20, textColor=C_DARK, leftIndent=24, spaceAfter=5)
sBullet   = S("sBullet",   fontSize=11, leading=18, textColor=C_DARK, leftIndent=32, spaceAfter=3)
sWarn     = S("sWarn",     fontSize=11, leading=18, textColor=C_AMBER, fontName="ThaiBold")
sWarnBody = S("sWarnBody", fontSize=11, leading=18, textColor=colors.HexColor("#92400e"))
sGood     = S("sGood",     fontSize=11, leading=18, textColor=C_GREEN_DARK)
sCenter   = S("sCenter",   fontSize=11, leading=18, textColor=C_GRAY, alignment=TA_CENTER)
sStep     = S("sStep",     fontSize=13, leading=20, textColor=C_WHITE, fontName="ThaiBold", alignment=TA_CENTER)
sPageNum  = S("sPageNum",  fontSize=10, leading=14, textColor=C_GRAY, alignment=TA_CENTER)
sFlowH    = S("sFlowH",    fontSize=13, leading=18, textColor=C_WHITE, fontName="ThaiBold", alignment=TA_CENTER)
sFlowSub  = S("sFlowSub",  fontSize=10, leading=14, textColor=C_GREEN_LIGHT, alignment=TA_CENTER)


def hr(color=C_GREEN_LIGHT, thickness=1):
    return HRFlowable(width="100%", thickness=thickness, color=color, spaceAfter=8, spaceBefore=4)


def step_badge(num, text, desc=""):
    """แถบขั้นตอนมีหมายเลข"""
    badge = Table(
        [[Paragraph(str(num), sStep),
          [Paragraph(text, S("sx", fontName="ThaiBold", fontSize=13, leading=19, textColor=C_DARK)),
           Paragraph(desc, sBodySm) if desc else Spacer(1,1)]]],
        colWidths=[1.2*cm, 13.5*cm],
        rowHeights=[None]
    )
    badge.setStyle(TableStyle([
        ("BACKGROUND",  (0,0),(0,-1), C_GREEN),
        ("BACKGROUND",  (1,0),(1,-1), C_GREEN_LIGHT),
        ("VALIGN",      (0,0),(-1,-1),"MIDDLE"),
        ("ALIGN",       (0,0),(0,-1),"CENTER"),
        ("LEFTPADDING", (0,0),(0,-1), 4),
        ("RIGHTPADDING",(0,0),(0,-1), 4),
        ("TOPPADDING",  (0,0),(-1,-1),8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("LEFTPADDING", (1,0),(1,-1), 10),
        ("ROUNDEDCORNERS",[6]),
        ("BOX", (0,0),(-1,-1), 0.5, C_GREEN),
    ]))
    return badge


def warn_box(title, body):
    t = Table([[Paragraph("⚠  "+title, sWarn)],[Paragraph(body, sWarnBody)]],
              colWidths=[14.7*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), C_AMBER_LIGHT),
        ("BOX",(0,0),(-1,-1),1.5, C_AMBER),
        ("LEFTPADDING",(0,0),(-1,-1),12),
        ("TOPPADDING",(0,0),(-1,-1),8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("ROUNDEDCORNERS",[6]),
    ]))
    return t


def tip_box(body):
    t = Table([[Paragraph("✅  "+body, sGood)]],colWidths=[14.7*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), C_GREEN_LIGHT),
        ("BOX",(0,0),(-1,-1),1.5, C_GREEN),
        ("LEFTPADDING",(0,0),(-1,-1),12),
        ("TOPPADDING",(0,0),(-1,-1),8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("ROUNDEDCORNERS",[6]),
    ]))
    return t


def info_box(body):
    t = Table([[Paragraph("ℹ  "+body, S("si", fontSize=11, leading=18, textColor=C_BLUE))]],colWidths=[14.7*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1), C_BLUE_LIGHT),
        ("BOX",(0,0),(-1,-1),1.5, C_BLUE),
        ("LEFTPADDING",(0,0),(-1,-1),12),
        ("TOPPADDING",(0,0),(-1,-1),8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
    ]))
    return t


# ══════════════════════════════════════════════════════════════════════════════
#  PDF 1: คู่มือการใช้งาน
# ══════════════════════════════════════════════════════════════════════════════
def make_manual():
    OUT = "D:/Facedeta/คู่มือการใช้งาน_FaceDeta.pdf"
    doc = SimpleDocTemplate(OUT, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm)

    story = []

    # ── Cover ──────────────────────────────────────────────────────────────────
    def cover(canvas_obj, doc_obj):
        canvas_obj.saveState()
        # Green gradient background
        canvas_obj.setFillColor(C_GREEN_DARK)
        canvas_obj.rect(0, H*0.45, W, H*0.55, fill=1, stroke=0)
        canvas_obj.setFillColor(C_GREEN)
        canvas_obj.rect(0, 0, W, H*0.45, fill=1, stroke=0)
        # Decorative circle
        canvas_obj.setFillColor(colors.HexColor("#ffffff18"))
        canvas_obj.circle(W*0.85, H*0.8, 120, fill=1, stroke=0)
        canvas_obj.circle(W*0.1, H*0.3, 80, fill=1, stroke=0)
        # Icon circle
        canvas_obj.setFillColor(colors.HexColor("#ffffff30"))
        canvas_obj.circle(W/2, H*0.72, 55, fill=1, stroke=0)
        canvas_obj.setFillColor(C_WHITE)
        canvas_obj.setFont("ThaiBold", 36)
        canvas_obj.drawCentredString(W/2, H*0.705, "👤")
        # Title
        canvas_obj.setFont("ThaiBold", 32)
        canvas_obj.setFillColor(C_WHITE)
        canvas_obj.drawCentredString(W/2, H*0.60, "คู่มือการใช้งานระบบ")
        canvas_obj.setFont("ThaiBold", 38)
        canvas_obj.setFillColor(C_GREEN_LIGHT)
        canvas_obj.drawCentredString(W/2, H*0.545, "FaceDeta")
        canvas_obj.setFont("Thai", 16)
        canvas_obj.setFillColor(C_WHITE)
        canvas_obj.drawCentredString(W/2, H*0.495, "ระบบค้นหารูปภาพด้วยใบหน้า")
        # Bottom section
        canvas_obj.setFont("Thai", 13)
        canvas_obj.setFillColor(C_WHITE)
        canvas_obj.drawCentredString(W/2, H*0.38, "สำหรับพนักงานทุกท่าน")
        canvas_obj.drawCentredString(W/2, H*0.35, "ไม่จำเป็นต้องมีความรู้ด้านคอมพิวเตอร์")
        # Footer
        canvas_obj.setFont("Thai", 11)
        canvas_obj.setFillColor(colors.HexColor("#a7f3d0"))
        canvas_obj.drawCentredString(W/2, 2*cm, "สร้างด้วยความรัก ❤  เพื่อช่วยค้นหารูปเด็ก")
        canvas_obj.restoreState()

    story.append(Spacer(1, 14*cm))  # Push content after cover drawn by onFirstPage

    # ── Page 2: สารบัญ ──────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("สารบัญ", sH1))
    story.append(hr())
    toc_data = [
        ["บทที่ 1", "ระบบ FaceDeta คืออะไร?", "3"],
        ["บทที่ 2", "การค้นหารูปภาพน้อง", "4"],
        ["", "   2.1  เปิดเว็บไซต์", "4"],
        ["", "   2.2  อัพโหลดรูปต้นแบบ", "5"],
        ["", "   2.3  เลือกระดับการค้นหา", "5"],
        ["", "   2.4  กดค้นหาและดูผลลัพธ์", "6"],
        ["บทที่ 3", "การเพิ่มรูปภาพเข้าระบบ (สำหรับผู้ดูแล)", "7"],
        ["", "   3.1  เข้าสู่หน้าจัดการ", "7"],
        ["", "   3.2  Sync รูปจาก Google Drive", "8"],
        ["", "   3.3  อัพโหลดรูปทีละรูป", "9"],
        ["บทที่ 4", "คำถามที่พบบ่อย", "10"],
        ["บทที่ 5", "ข้อควรระวัง", "11"],
    ]
    toc = Table(toc_data, colWidths=[2*cm, 10.7*cm, 1.5*cm])
    toc.setStyle(TableStyle([
        ("FONTNAME",    (0,0),(-1,-1), "Thai"),
        ("FONTSIZE",    (0,0),(-1,-1), 12),
        ("LEADING",     (0,0),(-1,-1), 20),
        ("FONTNAME",    (0,0),(0,-1),  "ThaiBold"),
        ("TEXTCOLOR",   (0,0),(0,-1),  C_GREEN_DARK),
        ("ALIGN",       (2,0),(2,-1),  "RIGHT"),
        ("TEXTCOLOR",   (2,0),(2,-1),  C_GRAY),
        ("TOPPADDING",  (0,0),(-1,-1), 4),
        ("BOTTOMPADDING",(0,0),(-1,-1),4),
        ("LINEBELOW",   (0,0),(-1,-1), 0.3, C_GRAY_LIGHT),
    ]))
    story.append(toc)

    # ── บทที่ 1: คืออะไร ────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("บทที่ 1  ระบบ FaceDeta คืออะไร?", sH1))
    story.append(hr())
    story.append(Paragraph(
        "FaceDeta คือระบบค้นหารูปภาพอัจฉริยะที่ใช้เทคโนโลยีการจดจำใบหน้า "
        "เพียงแค่อัพโหลดรูปถ่ายของน้องคนหนึ่ง ระบบจะค้นหาและรวบรวมรูปทุกรูป "
        "ที่มีน้องคนนั้นอยู่ให้โดยอัตโนมัติ ไม่ต้องค้นหาทีละรูปด้วยตัวเอง", sBody))
    story.append(Spacer(1, 0.3*cm))

    feat_data = [
        ["🔍", "ค้นหาได้ทันที", "ผลลัพธ์ออกมาภายในไม่กี่วินาที"],
        ["👶", "แม่นยำสูง", "ระบบ AI ระดับโลกที่ใช้โดยผู้เชี่ยวชาญ"],
        ["📱", "ใช้งานบนมือถือ", "ไม่ต้องติดตั้งแอพ เปิดผ่านเบราว์เซอร์ได้เลย"],
        ["☁️", "รูปอยู่บน Drive", "รูปทั้งหมดเก็บอยู่บน Google Drive ปลอดภัย"],
    ]
    feat = Table(feat_data, colWidths=[1.2*cm, 4*cm, 9*cm])
    feat.setStyle(TableStyle([
        ("FONTNAME",   (0,0),(-1,-1), "Thai"),
        ("FONTSIZE",   (0,0),(-1,-1), 12),
        ("LEADING",    (0,0),(-1,-1), 20),
        ("FONTNAME",   (1,0),(1,-1),  "ThaiBold"),
        ("TEXTCOLOR",  (1,0),(1,-1),  C_GREEN_DARK),
        ("BACKGROUND", (0,0),(-1,-1), C_GREEN_LIGHT),
        ("ROWBACKGROUNDS",(0,0),(-1,-1),[C_GREEN_LIGHT, C_WHITE]),
        ("TOPPADDING", (0,0),(-1,-1), 8),
        ("BOTTOMPADDING",(0,0),(-1,-1),8),
        ("LEFTPADDING",(0,0),(-1,-1), 10),
        ("BOX",(0,0),(-1,-1),1,C_GREEN),
        ("INNERGRID",(0,0),(-1,-1),0.3,C_GREEN_LIGHT),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ]))
    story.append(feat)

    # ── บทที่ 2: ค้นหารูป ───────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("บทที่ 2  การค้นหารูปภาพน้อง", sH1))
    story.append(hr())
    story.append(info_box("ส่วนนี้สำหรับพนักงานทุกท่านที่ต้องการค้นหารูปภาพน้อง"))
    story.append(Spacer(1, 0.4*cm))

    # Step 1
    story.append(KeepTogether([
        step_badge(1, "เปิดเว็บไซต์ FaceDeta", ""),
        Spacer(1, 0.3*cm),
        Paragraph("เปิดโปรแกรมเบราว์เซอร์บนมือถือหรือคอมพิวเตอร์ "
                  "(Chrome, Safari, Firefox ก็ได้) แล้วพิมพ์ที่อยู่เว็บไซต์ในช่องค้นหา", sBody),
        tip_box("สามารถใช้งานได้ทั้งบนโทรศัพท์มือถือ แท็บเล็ต และคอมพิวเตอร์"),
        Spacer(1, 0.5*cm),
    ]))

    # Step 2
    story.append(KeepTogether([
        step_badge(2, "อัพโหลดรูปต้นแบบ (รูปน้อง)", ""),
        Spacer(1, 0.3*cm),
        Paragraph('กดที่กรอบสี่เหลี่ยมตรงกลางหน้าจอที่เขียนว่า '
                  '<b>&ldquo;ลากรูปใบหน้ามาวางหรือแตะเพื่อเลือก&rdquo;</b> '
                  'แล้วเลือกรูปถ่ายของน้องจากในโทรศัพท์หรือคอมพิวเตอร์ของท่าน', sBody),
        Spacer(1, 0.2*cm),
        Paragraph("รูปที่ดีควรเป็นแบบนี้:", sH3),
        Paragraph("✅  เห็นใบหน้าน้องชัดเจน ไม่เบลอ", sBullet),
        Paragraph("✅  รูปหน้าตรง หรือหน้าเอียงเล็กน้อย", sBullet),
        Paragraph("✅  แสงสว่างเพียงพอ ไม่มืดหรือสว่างจนเกินไป", sBullet),
        Paragraph("✅  ไม่สวมหมวกหรือแว่นตาทึบ", sBullet),
        Paragraph("✅  มีน้องเพียงคนเดียวในรูป", sBullet),
        Spacer(1, 0.2*cm),
        warn_box("รูปที่ควรหลีกเลี่ยง",
                 "รูปเบลอหรือไม่ชัด • รูปที่มีหน้าหลายคน • รูปถ่ายจากระยะไกลมาก "
                 "• รูปที่ใบหน้าถูกบัง • รูปขนาดเล็กเกิน 10MB"),
        Spacer(1, 0.5*cm),
    ]))

    # Step 3
    story.append(KeepTogether([
        step_badge(3, "เลือกระดับการค้นหา", ""),
        Spacer(1, 0.3*cm),
        Paragraph("ระดับการค้นหามี 3 แบบ เลือกตามความต้องการ:", sBody),
        Spacer(1, 0.2*cm),
    ]))

    level_data = [
        ["ระดับ", "ชื่อ", "เหมาะกับ", "ความแม่นยำ"],
        ["🔍 60%", "ค้นหาทั่วไป", "รูปถ่ายจากระยะไกล หรือต้องการพบรูปให้ได้มากที่สุด", "ปานกลาง"],
        ["👥 75%", "ค้นหาละเอียด", "รูปหมู่หรือรูปถ่ายทั่วไป\n(แนะนำให้ใช้เป็นค่าเริ่มต้น)", "ดี"],
        ["🎯 90%", "ค้นหารายบุคคล", "รูปที่เห็นหน้าชัดมาก ต้องการผลที่แม่นยำที่สุด", "สูงมาก"],
    ]
    level_tbl = Table(level_data, colWidths=[2*cm, 3.5*cm, 6.5*cm, 2.2*cm])
    level_tbl.setStyle(TableStyle([
        ("FONTNAME",    (0,0),(-1,-1), "Thai"),
        ("FONTSIZE",    (0,0),(-1,-1), 11),
        ("LEADING",     (0,0),(-1,-1), 18),
        ("FONTNAME",    (0,0),(-1,0),  "ThaiBold"),
        ("BACKGROUND",  (0,0),(-1,0),  C_GREEN_DARK),
        ("TEXTCOLOR",   (0,0),(-1,0),  C_WHITE),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[C_GREEN_LIGHT, C_WHITE, C_GREEN_LIGHT]),
        ("ALIGN",       (3,0),(3,-1),  "CENTER"),
        ("VALIGN",      (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",  (0,0),(-1,-1), 7),
        ("BOTTOMPADDING",(0,0),(-1,-1),7),
        ("LEFTPADDING", (0,0),(-1,-1), 8),
        ("BOX",         (0,0),(-1,-1), 1, C_GREEN),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GREEN),
    ]))
    story.append(level_tbl)
    story.append(Spacer(1, 0.3*cm))
    story.append(tip_box("หากไม่แน่ใจ ให้เลือก 'ค้นหาละเอียด' (75%) เป็นค่าเริ่มต้นก่อน"))

    # Step 4
    story.append(PageBreak())
    story.append(KeepTogether([
        step_badge(4, "กดปุ่มค้นหา", ""),
        Spacer(1, 0.3*cm),
        Paragraph('กดปุ่มสีเขียวที่เขียนว่า <b>&ldquo;ค้นหารูปภาพ&rdquo;</b> ระบบจะเริ่มทำการค้นหาโดยอัตโนมัติ '
                  'รอสักครู่ประมาณ 5-15 วินาที ระหว่างรอจะเห็นข้อความ &ldquo;กำลังค้นหา...&rdquo;', sBody),
        Spacer(1, 0.3*cm),
    ]))

    story.append(KeepTogether([
        step_badge(5, "ดูผลการค้นหา", ""),
        Spacer(1, 0.3*cm),
        Paragraph("ระบบจะแสดงรูปภาพทั้งหมดที่พบ โดยเรียงจากที่แม่นยำที่สุดก่อน "
                  "แต่ละรูปจะมีเปอร์เซ็นต์ความแม่นยำแสดงอยู่มุมขวาบน", sBody),
        Spacer(1, 0.2*cm),
    ]))

    result_data = [
        ["สีของเปอร์เซ็นต์", "ความหมาย"],
        ["🟢 สีเขียว (90%+)", "ระบบมั่นใจมากว่าเป็นน้องคนเดียวกัน"],
        ["🟡 สีเหลือง (75-89%)", "น่าจะเป็นน้องคนเดียวกัน ควรตรวจสอบอีกครั้ง"],
        ["🔴 สีแดง (60-74%)", "คล้ายกัน แต่ควรตรวจสอบด้วยตาเองก่อน"],
    ]
    r_tbl = Table(result_data, colWidths=[5.5*cm, 9.2*cm])
    r_tbl.setStyle(TableStyle([
        ("FONTNAME",    (0,0),(-1,-1), "Thai"),
        ("FONTSIZE",    (0,0),(-1,-1), 11),
        ("LEADING",     (0,0),(-1,-1), 18),
        ("FONTNAME",    (0,0),(-1,0),  "ThaiBold"),
        ("BACKGROUND",  (0,0),(-1,0),  C_DARK),
        ("TEXTCOLOR",   (0,0),(-1,0),  C_WHITE),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[C_WHITE, C_GRAY_LIGHT, C_WHITE]),
        ("VALIGN",      (0,0),(-1,-1), "MIDDLE"),
        ("TOPPADDING",  (0,0),(-1,-1), 7),
        ("BOTTOMPADDING",(0,0),(-1,-1),7),
        ("LEFTPADDING", (0,0),(-1,-1), 8),
        ("BOX",         (0,0),(-1,-1), 1, C_GRAY),
        ("INNERGRID",   (0,0),(-1,-1), 0.3, C_GRAY_LIGHT),
    ]))
    story.append(r_tbl)
    story.append(Spacer(1, 0.3*cm))
    story.append(info_box("ถ้าไม่พบรูป ให้ลองเปลี่ยนระดับเป็น 'ค้นหาทั่วไป' แล้วค้นหาใหม่อีกครั้ง"))

    # ── บทที่ 3: Admin ──────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("บทที่ 3  การเพิ่มรูปภาพเข้าระบบ", sH1))
    story.append(Paragraph("(สำหรับผู้ดูแลระบบเท่านั้น)", S("sx2", fontSize=13, textColor=C_GRAY, spaceAfter=6)))
    story.append(hr())
    story.append(warn_box("สำคัญ!",
        "ส่วนนี้สำหรับผู้ดูแลระบบ (Admin) เท่านั้น พนักงานทั่วไปไม่จำเป็นต้องทำในส่วนนี้"))
    story.append(Spacer(1, 0.4*cm))

    story.append(KeepTogether([
        step_badge(1, "เข้าสู่หน้าจัดการ (Admin)", ""),
        Spacer(1, 0.3*cm),
        Paragraph('กดปุ่ม <b>&ldquo;จัดการระบบ&rdquo;</b> ที่มุมบนขวาของหน้าเว็บ '
                  '(มีไอคอนรูปเฟือง)', sBody),
        Paragraph('จะมีหน้าต่างขึ้นมาถามรหัสผ่าน ให้ใส่รหัสผ่านที่ได้รับจากผู้ดูแลระบบ', sBody),
        Paragraph('กดปุ่ม <b>&ldquo;เข้าสู่หน้าจัดการ&rdquo;</b> สีเขียว', sBody),
        Spacer(1, 0.2*cm),
        warn_box("อย่าแชร์รหัสผ่าน", "รหัสผ่านนี้เป็นความลับ ห้ามบอกกับบุคคลภายนอก"),
        Spacer(1, 0.5*cm),
    ]))

    story.append(KeepTogether([
        step_badge(2, "Sync รูปจาก Google Drive", "วิธีดึงรูปทั้งหมดจาก Drive เข้าระบบ"),
        Spacer(1, 0.3*cm),
        Paragraph("วิธีนี้ใช้เมื่อมีรูปจำนวนมากที่เก็บอยู่ใน Google Drive แล้ว", sBody),
        Spacer(1, 0.2*cm),
        Paragraph("1.  เปิด Google Drive ในเบราว์เซอร์", sNum),
        Paragraph("2.  เข้าไปในโฟลเดอร์ที่เก็บรูปภาพงาน", sNum),
        Paragraph("3.  Copy URL (ที่อยู่เว็บ) จากแถบด้านบน เช่น:\n"
                  "    https://drive.google.com/drive/folders/1BxiMV...", sNum),
        Paragraph("4.  กลับมาที่หน้า FaceDeta กรอก URL ในช่อง 'ลิงก์ Google Drive Folder'", sNum),
        Paragraph("5.  ใส่ชื่อกิจกรรม (เช่น Medcamp 2567) และวันที่", sNum),
        Paragraph("6.  กดปุ่มสีเขียว <b>'เริ่ม Sync Drive'</b>", sNum),
        Paragraph("7.  รอระบบประมวลผลรูปทีละรูป จะเห็นผลแบบ Real-time", sNum),
        Spacer(1, 0.2*cm),
        tip_box("ระบบจะข้ามรูปที่ Index แล้วอัตโนมัติ ไม่ต้องกังวลเรื่องรูปซ้ำ"),
        Spacer(1, 0.5*cm),
    ]))

    story.append(KeepTogether([
        step_badge(3, "อัพโหลดรูปทีละรูป", "สำหรับรูปที่ต้องการเพิ่มเป็นรายรูป"),
        Spacer(1, 0.3*cm),
        Paragraph("1.  กดที่กรอบอัพโหลดด้านซ้ายมือ แล้วเลือกรูปจากเครื่อง", sNum),
        Paragraph("2.  ใส่ชื่อกิจกรรมและวันที่ (ไม่บังคับ แต่แนะนำให้ใส่)", sNum),
        Paragraph("3.  กดปุ่ม <b>'อัพโหลดและ Index'</b>", sNum),
        Paragraph("4.  รอระบบประมวลผล จะมีข้อความแจ้งว่า 'Index สำเร็จ พบ X ใบหน้า'", sNum),
        Spacer(1, 0.5*cm),
    ]))

    # ── บทที่ 4: FAQ ────────────────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("บทที่ 4  คำถามที่พบบ่อย (FAQ)", sH1))
    story.append(hr())

    faqs = [
        ("❓ ค้นหาแล้วไม่พบรูปเลย ทำอย่างไร?",
         "ลองเปลี่ยนระดับการค้นหาเป็น 'ค้นหาทั่วไป' (60%) แล้วกดค้นหาใหม่ "
         "หรือลองใช้รูปน้องที่เห็นหน้าชัดขึ้น ไม่มีแว่น ไม่มีหมวก"),
        ("❓ รูปที่ขึ้นมาไม่ใช่น้องคนที่ค้นหา ทำอย่างไร?",
         "เพิ่มระดับความแม่นยำเป็น 'ค้นหารายบุคคล' (90%) เพื่อกรองเฉพาะรูปที่ใกล้เคียงที่สุด"),
        ("❓ ระบบช้ามากใช้เวลานาน?",
         "ระบบอาจช้าในช่วงที่มีผู้ใช้งานพร้อมกันหลายคน ให้รอสักครู่ ปกติไม่เกิน 30 วินาที"),
        ("❓ อัพโหลดรูปแล้วขึ้นว่า 'ไม่พบใบหน้าในรูปนี้' หมายความว่าอะไร?",
         "ระบบไม่สามารถตรวจพบใบหน้าในรูปที่อัพโหลด ให้ลองใช้รูปที่เห็นหน้าชัดขึ้น"),
        ("❓ ใช้งานบนมือถือได้ไหม?",
         "ได้เลย ระบบออกแบบมาให้ใช้งานบนมือถือได้สะดวก เปิดเบราว์เซอร์แล้วเข้าเว็บได้เลย"),
        ("❓ ข้อมูลรูปภาพปลอดภัยไหม?",
         "รูปภาพทั้งหมดเก็บอยู่บน Google Drive ขององค์กร ระบบ AI จะอ่านเฉพาะ 'รูปแบบใบหน้า' "
         "ไม่ได้เก็บรูปไว้ในเซิร์ฟเวอร์อื่น"),
    ]
    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(q, S("fq", fontName="ThaiBold", fontSize=12, leading=20,
                           textColor=C_GREEN_DARK, spaceBefore=10, spaceAfter=2)),
            Paragraph("➜  "+a, S("fa", fontSize=11, leading=18, textColor=C_DARK,
                                  leftIndent=16, spaceAfter=4)),
            HRFlowable(width="100%", thickness=0.3, color=C_GRAY_LIGHT, spaceAfter=4),
        ]))

    # ── บทที่ 5: ข้อควรระวัง ───────────────────────────────────────────────────
    story.append(PageBreak())
    story.append(Paragraph("บทที่ 5  ข้อควรระวัง", sH1))
    story.append(hr())
    warns = [
        ("🔒 ความเป็นส่วนตัว",
         "ระบบนี้มีไว้เพื่อช่วยค้นหารูปภาพน้องในองค์กรเท่านั้น "
         "ห้ามใช้ค้นหาบุคคลภายนอกโดยไม่ได้รับอนุญาต"),
        ("🔑 รหัสผ่าน Admin",
         "รหัสผ่านสำหรับเข้าหน้าจัดการเป็นความลับ ห้ามบอกกับผู้ที่ไม่เกี่ยวข้อง "
         "ถ้าสงสัยว่ารหัสผ่านรั่วไหล ให้แจ้งผู้ดูแลระบบทันที"),
        ("📸 คุณภาพรูป",
         "ผลลัพธ์ขึ้นอยู่กับคุณภาพของรูปที่ใช้ค้นหา ยิ่งรูปชัดเจนมาก ยิ่งได้ผลแม่นยำมาก"),
        ("⚖️ การตรวจสอบผลลัพธ์",
         "ระบบ AI อาจมีความคลาดเคลื่อนได้บ้าง ควรตรวจสอบด้วยสายตาของท่านเองก่อนนำผลไปใช้"),
    ]
    for title, body in warns:
        story.append(KeepTogether([
            Table([[Paragraph(title, S("wt", fontName="ThaiBold", fontSize=12, leading=20,
                                       textColor=C_DARK)),
                    Paragraph(body, S("wb", fontSize=11, leading=18, textColor=C_DARK))]],
                  colWidths=[4.5*cm, 10.2*cm],
                  style=[
                      ("BACKGROUND",(0,0),(-1,-1),C_RED_LIGHT),
                      ("BOX",(0,0),(-1,-1),1,C_RED),
                      ("LEFTPADDING",(0,0),(-1,-1),10),
                      ("TOPPADDING",(0,0),(-1,-1),8),
                      ("BOTTOMPADDING",(0,0),(-1,-1),8),
                      ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
                  ]),
            Spacer(1, 0.4*cm),
        ]))

    story.append(Spacer(1, 1*cm))
    story.append(Table(
        [[Paragraph("มีปัญหาการใช้งาน? ติดต่อผู้ดูแลระบบได้ทันที ❤",
                    S("sc", fontSize=13, textColor=C_WHITE, fontName="ThaiBold", alignment=TA_CENTER))]],
        colWidths=[14.7*cm],
        style=[("BACKGROUND",(0,0),(-1,-1),C_GREEN_DARK),
               ("TOPPADDING",(0,0),(-1,-1),14),("BOTTOMPADDING",(0,0),(-1,-1),14),
               ("ROUNDEDCORNERS",[8])]))

    # ── Build ──────────────────────────────────────────────────────────────────
    def add_page_num(canvas_obj, doc_obj):
        if doc_obj.page == 1:
            cover(canvas_obj, doc_obj)
            return
        canvas_obj.saveState()
        canvas_obj.setFont("Thai", 9)
        canvas_obj.setFillColor(C_GRAY)
        canvas_obj.drawCentredString(W/2, 1.2*cm, f"คู่มือการใช้งาน FaceDeta  |  หน้า {doc_obj.page}")
        canvas_obj.setFillColor(C_GREEN)
        canvas_obj.rect(0, H-0.4*cm, W, 0.4*cm, fill=1, stroke=0)
        canvas_obj.setFont("Thai", 9)
        canvas_obj.setFillColor(C_WHITE)
        canvas_obj.drawCentredString(W/2, H-0.32*cm, "FaceDeta — ระบบค้นหารูปภาพด้วยใบหน้า")
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=add_page_num, onLaterPages=add_page_num)
    print(f"✅ PDF 1 สร้างแล้ว: {OUT}")
    return OUT


# ══════════════════════════════════════════════════════════════════════════════
#  PDF 2: ขั้นตอนการใช้งานฉบับย่อ (Quick Guide)
# ══════════════════════════════════════════════════════════════════════════════
def make_quickguide():
    OUT = "D:/Facedeta/ขั้นตอนการใช้งาน_ฉบับย่อ.pdf"
    c = canvas.Canvas(OUT, pagesize=A4)

    def page_header(title, subtitle, color=C_GREEN_DARK):
        c.setFillColor(color)
        c.rect(0, H-2.2*cm, W, 2.2*cm, fill=1, stroke=0)
        c.setFont("ThaiBold", 18)
        c.setFillColor(C_WHITE)
        c.drawCentredString(W/2, H-1.3*cm, title)
        c.setFont("Thai", 11)
        c.setFillColor(C_GREEN_LIGHT)
        c.drawCentredString(W/2, H-1.8*cm, subtitle)

    def step_box(x, y, w, h, num, title, lines, color=C_GREEN):
        # Box
        c.setFillColor(colors.HexColor("#f0fdf4"))
        c.roundRect(x, y, w, h, 8, fill=1, stroke=0)
        c.setStrokeColor(color)
        c.setLineWidth(1.5)
        c.roundRect(x, y, w, h, 8, fill=0, stroke=1)
        # Number badge
        c.setFillColor(color)
        c.circle(x+1.2*cm, y+h-1.2*cm, 0.55*cm, fill=1, stroke=0)
        c.setFont("ThaiBold", 14)
        c.setFillColor(C_WHITE)
        c.drawCentredString(x+1.2*cm, y+h-1.35*cm, str(num))
        # Title
        c.setFont("ThaiBold", 13)
        c.setFillColor(C_GREEN_DARK)
        c.drawString(x+2.2*cm, y+h-1.3*cm, title)
        # Lines
        c.setFont("Thai", 11)
        c.setFillColor(colors.HexColor("#374151"))
        for i, line in enumerate(lines):
            c.drawString(x+0.6*cm, y+h-2.2*cm-(i*0.55*cm), line)

    def footer(pg):
        c.setFont("Thai", 9)
        c.setFillColor(C_GRAY)
        c.drawCentredString(W/2, 0.8*cm, f"FaceDeta — ขั้นตอนการใช้งานฉบับย่อ  |  หน้า {pg}")

    # ── Page 1: ค้นหารูปภาพ ─────────────────────────────────────────────────────
    page_header("ขั้นตอนการค้นหารูปภาพน้อง", "สำหรับพนักงานทุกท่าน • ใช้เวลาไม่เกิน 1 นาที")

    bw = (W - 3*cm) / 2
    bh = 3.2*cm

    # Row 1
    step_box(1*cm, H-6.2*cm, bw, bh, 1, "เปิดเว็บไซต์", [
        "📱 เปิดเบราว์เซอร์บนมือถือหรือคอม",
        "🌐 พิมพ์ที่อยู่เว็บ FaceDeta",
        "   รอให้หน้าโหลดสมบูรณ์",
    ])
    step_box(1*cm+bw+1*cm, H-6.2*cm, bw, bh, 2, "อัพโหลดรูปน้อง", [
        "📸 กดกรอบสีเขียวตรงกลางหน้าจอ",
        "🖼  เลือกรูปน้องที่เห็นหน้าชัดเจน",
        "   รูปควรมีน้องเพียงคนเดียว",
    ])
    # Arrow
    c.setFont("Thai", 20)
    c.setFillColor(C_GREEN)
    c.drawCentredString(W/2, H-5.2*cm, "▼")

    # Row 2
    step_box(1*cm, H-10.3*cm, bw, bh, 3, "เลือกระดับค้นหา", [
        "🔍 60% = ค้นหาทั่วไป (เจอมาก)",
        "👥 75% = ค้นหาละเอียด (แนะนำ)",
        "🎯 90% = ค้นหารายบุคคล (แม่นสุด)",
    ])
    step_box(1*cm+bw+1*cm, H-10.3*cm, bw, bh, 4, "กดค้นหา", [
        "🟢 กดปุ่มสีเขียว 'ค้นหารูปภาพ'",
        "⏳ รอระบบประมวลผล 5-15 วินาที",
        "   เห็น 'กำลังค้นหา...' แสดงว่าทำงาน",
    ])
    c.setFont("Thai", 20)
    c.setFillColor(C_GREEN)
    c.drawCentredString(W/2, H-9.3*cm, "▼")

    # Row 3 - centered
    step_box(1*cm, H-14.4*cm, W-2*cm, bh, 5, "ดูผลลัพธ์", [
        "✅ รูปที่ขึ้นมาคือรูปที่พบน้องในระบบ",
        "📊 เปอร์เซ็นต์ = ความแม่นยำ (สีเขียวมาก = มั่นใจมาก)",
        "🔄 ถ้าไม่พบ ให้ลดระดับเป็น 60% แล้วลองใหม่",
    ])

    # Tips section
    c.setFillColor(C_AMBER_LIGHT)
    c.roundRect(1*cm, H-18.5*cm, W-2*cm, 3.5*cm, 8, fill=1, stroke=0)
    c.setStrokeColor(C_AMBER)
    c.setLineWidth(1.5)
    c.roundRect(1*cm, H-18.5*cm, W-2*cm, 3.5*cm, 8, fill=0, stroke=1)
    c.setFont("ThaiBold", 12)
    c.setFillColor(colors.HexColor("#92400e"))
    c.drawString(1.5*cm, H-15.4*cm, "⚠  เคล็ดลับเพื่อผลลัพธ์ที่ดี")
    tips = [
        "✅ ใช้รูปที่เห็นหน้าน้องชัดเจน ไม่เบลอ",
        "✅ รูปควรมีน้องเพียงคนเดียว ไม่มีคนอื่นบัง",
        "✅ น้องไม่ควรสวมหมวกหรือแว่นตาทึบ",
        "✅ แสงสว่างเพียงพอ ไม่มืดหรือสว่างจนเกิน",
    ]
    c.setFont("Thai", 11)
    c.setFillColor(colors.HexColor("#78350f"))
    for i, t in enumerate(tips):
        col = 1.5*cm if i < 2 else W/2+0.5*cm
        row = H-16.2*cm if i % 2 == 0 else H-17*cm
        c.drawString(col, row, t)

    # Title label
    c.setFillColor(C_GREEN)
    c.roundRect(1*cm, H-19.5*cm, W-2*cm, 0.7*cm, 6, fill=1, stroke=0)
    c.setFont("ThaiBold", 12)
    c.setFillColor(C_WHITE)
    c.drawCentredString(W/2, H-19.2*cm, "📞 มีปัญหา? ติดต่อผู้ดูแลระบบได้ทันที")

    footer(1)
    c.showPage()

    # ── Page 2: เพิ่มรูปภาพ (Admin) ────────────────────────────────────────────
    page_header("ขั้นตอนการเพิ่มรูปภาพเข้าระบบ", "สำหรับผู้ดูแลระบบ (Admin) เท่านั้น", C_EMERALD)

    bh2 = 3*cm
    step_box(1*cm, H-6*cm, W-2*cm, bh2, 1, "เข้าหน้าจัดการ Admin", [
        "⚙  กดปุ่ม 'จัดการระบบ' มุมบนขวาของเว็บ",
        "🔑 ใส่รหัสผ่านที่ได้รับจากผู้ดูแล",
        "✅ กด 'เข้าสู่หน้าจัดการ'",
    ])

    # Sync Drive Section
    c.setFillColor(C_BLUE_LIGHT)
    c.roundRect(1*cm, H-12.5*cm, W-2*cm, 5.8*cm, 8, fill=1, stroke=0)
    c.setStrokeColor(C_BLUE)
    c.setLineWidth(1.5)
    c.roundRect(1*cm, H-12.5*cm, W-2*cm, 5.8*cm, 8, fill=0, stroke=1)
    c.setFont("ThaiBold", 13)
    c.setFillColor(C_BLUE)
    c.drawString(1.8*cm, H-7.2*cm, "2  Sync รูปจาก Google Drive (แนะนำ)")
    sync_steps = [
        "1. เปิด Google Drive → เข้าโฟลเดอร์รูปงาน",
        "2. Copy URL จากแถบที่อยู่เว็บ",
        "3. วาง URL ในช่อง 'ลิงก์ Google Drive Folder'",
        "4. ใส่ชื่อกิจกรรมและวันที่",
        "5. กด 'เริ่ม Sync Drive' สีเขียว → รอระบบประมวลผล",
        "6. เห็นผลรายรูป Real-time ด้านล่าง",
    ]
    c.setFont("Thai", 11)
    c.setFillColor(colors.HexColor("#1e3a5f"))
    for i, s in enumerate(sync_steps):
        c.drawString(2*cm, H-8.1*cm-(i*0.6*cm), s)

    # Upload single
    bh3 = 2.8*cm
    step_box(1*cm, H-16.3*cm, W-2*cm, bh3, 3, "อัพโหลดรูปทีละรูป (สำหรับรูปเดี่ยว)", [
        "📎 กดกรอบอัพโหลดด้านซ้าย → เลือกรูป",
        "✏️  ใส่ชื่อกิจกรรมและวันที่ (แนะนำ)",
        "✅ กด 'อัพโหลดและ Index' → รอแจ้งเตือนสำเร็จ",
    ])

    # Important note
    c.setFillColor(C_RED_LIGHT)
    c.roundRect(1*cm, H-20.5*cm, W-2*cm, 3.5*cm, 8, fill=1, stroke=0)
    c.setStrokeColor(C_RED)
    c.setLineWidth(1.5)
    c.roundRect(1*cm, H-20.5*cm, W-2*cm, 3.5*cm, 8, fill=0, stroke=1)
    c.setFont("ThaiBold", 12)
    c.setFillColor(C_RED)
    c.drawString(1.5*cm, H-17.4*cm, "🔴  ข้อควรระวังสำหรับ Admin")
    admin_warns = [
        "🔒 อย่าแชร์รหัสผ่านกับบุคคลภายนอก",
        "📁 ตรวจสอบว่าโฟลเดอร์ Drive ถูกต้องก่อน Sync",
        "⏳ อย่าปิดหน้าต่างเบราว์เซอร์ระหว่าง Sync",
        "📊 รูปที่ Index แล้วจะถูกข้ามอัตโนมัติ ไม่ต้องห่วง",
    ]
    c.setFont("Thai", 11)
    c.setFillColor(colors.HexColor("#7f1d1d"))
    for i, w in enumerate(admin_warns):
        col = 1.5*cm if i < 2 else W/2+0.5*cm
        row = H-18.2*cm if i % 2 == 0 else H-19*cm
        c.drawString(col, row, w)

    c.setFillColor(C_EMERALD)
    c.roundRect(1*cm, H-21.5*cm, W-2*cm, 0.7*cm, 6, fill=1, stroke=0)
    c.setFont("ThaiBold", 12)
    c.setFillColor(C_WHITE)
    c.drawCentredString(W/2, H-21.2*cm, "สำเร็จ! รูปภาพพร้อมให้ค้นหาได้ทันที ✅")

    footer(2)
    c.save()
    print(f"✅ PDF 2 สร้างแล้ว: {OUT}")
    return OUT


# ══════════════════════════════════════════════════════════════════════════════
#  PDF 3: Flow Chart
# ══════════════════════════════════════════════════════════════════════════════
def make_flowchart():
    OUT = "D:/Facedeta/Flow_การทำงาน_FaceDeta.pdf"
    c = canvas.Canvas(OUT, pagesize=A4)

    def box(x, y, w, h, title, subtitle="", bg=C_GREEN, fg=C_WHITE, radius=10):
        c.setFillColor(bg)
        c.roundRect(x, y, w, h, radius, fill=1, stroke=0)
        c.setStrokeColor(colors.HexColor("#00000022"))
        c.setLineWidth(1)
        c.roundRect(x, y, w, h, radius, fill=0, stroke=1)
        c.setFont("ThaiBold", 12)
        c.setFillColor(fg)
        ty = y + h/2 + (0.25*cm if subtitle else 0)
        c.drawCentredString(x + w/2, ty, title)
        if subtitle:
            c.setFont("Thai", 9)
            c.setFillColor(colors.HexColor("#d1fae5") if bg == C_GREEN else colors.HexColor("#374151"))
            c.drawCentredString(x + w/2, y + h/2 - 0.35*cm, subtitle)

    def diamond(cx, cy, hw, hh, text, bg=C_AMBER, fg=C_WHITE):
        c.setFillColor(bg)
        path = c.beginPath()
        path.moveTo(cx, cy+hh)
        path.lineTo(cx+hw, cy)
        path.lineTo(cx, cy-hh)
        path.lineTo(cx-hw, cy)
        path.close()
        c.drawPath(path, fill=1, stroke=0)
        c.setFont("ThaiBold", 11)
        c.setFillColor(fg)
        c.drawCentredString(cx, cy-0.15*cm, text)

    def arrow(x1, y1, x2, y2, label=""):
        c.setStrokeColor(C_GREEN_DARK)
        c.setLineWidth(2)
        c.line(x1, y1, x2, y2)
        # arrowhead
        c.setFillColor(C_GREEN_DARK)
        if y1 != y2:  # vertical
            p = c.beginPath(); p.moveTo(x2-6,y2+10); p.lineTo(x2+6,y2+10); p.lineTo(x2,y2); p.close(); c.drawPath(p,fill=1,stroke=0)
        else:  # horizontal
            p = c.beginPath(); p.moveTo(x2-10,y2-6); p.lineTo(x2-10,y2+6); p.lineTo(x2,y2); p.close(); c.drawPath(p,fill=1,stroke=0)
        if label:
            c.setFont("Thai", 9)
            c.setFillColor(C_GRAY)
            mx, my = (x1+x2)/2, (y1+y2)/2
            c.drawCentredString(mx+0.8*cm, my, label)

    def larrow(x1, y1, x2, y2, label=""):
        c.setStrokeColor(C_RED)
        c.setLineWidth(1.5)
        c.setDash([4,3])
        c.line(x1, y1, x2, y2)
        c.setDash()
        c.setFillColor(C_RED)
        if y1 == y2:
            p3=c.beginPath();p3.moveTo(x2+10,y2-5);p3.lineTo(x2+10,y2+5);p3.lineTo(x2,y2);p3.close();c.drawPath(p3,fill=1,stroke=0)
        if label:
            c.setFont("Thai", 9)
            c.setFillColor(C_RED)
            c.drawCentredString((x1+x2)/2, y1+0.2*cm, label)

    # ── Header ────────────────────────────────────────────────────────────────
    c.setFillColor(C_GREEN_DARK)
    c.rect(0, H-2*cm, W, 2*cm, fill=1, stroke=0)
    c.setFont("ThaiBold", 20)
    c.setFillColor(C_WHITE)
    c.drawCentredString(W/2, H-1.1*cm, "Flow การทำงานระบบ FaceDeta")
    c.setFont("Thai", 11)
    c.setFillColor(C_GREEN_LIGHT)
    c.drawCentredString(W/2, H-1.6*cm, "ภาพรวมขั้นตอนตั้งแต่เริ่มต้นจนได้ผลลัพธ์")

    # ── Flow: ค้นหา ──────────────────────────────────────────────────────────
    # Left column: User flow
    cx = W*0.28
    bw = 5.8*cm

    c.setFont("ThaiBold", 11)
    c.setFillColor(C_GREEN_DARK)
    c.drawCentredString(cx, H-2.6*cm, "👤 ผู้ใช้ทั่วไป (ค้นหารูป)")

    y = H-3.4*cm
    box(cx-bw/2, y-1*cm, bw, 0.9*cm, "1. เปิดเว็บ FaceDeta", "บนมือถือหรือคอมพิวเตอร์")
    arrow(cx, y-1*cm, cx, y-2.1*cm)
    y -= 2.1*cm
    box(cx-bw/2, y-1*cm, bw, 0.9*cm, "2. อัพโหลดรูปน้อง", "รูปที่เห็นหน้าชัดเจน")
    arrow(cx, y-1*cm, cx, y-2.1*cm)
    y -= 2.1*cm
    box(cx-bw/2, y-1*cm, bw, 0.9*cm, "3. เลือกระดับค้นหา", "60% / 75% / 90%")
    arrow(cx, y-1*cm, cx, y-2.1*cm)
    y -= 2.1*cm
    box(cx-bw/2, y-1*cm, bw, 0.9*cm, "4. กดปุ่มค้นหา", "")
    arrow(cx, y-1*cm, cx, y-2.3*cm)
    y -= 2.3*cm

    # Diamond decision
    dcy = y-0.7*cm
    diamond(cx, dcy, 2.6*cm, 0.65*cm, "พบรูปไหม?")
    arrow(cx, dcy-0.65*cm, cx, dcy-1.85*cm)

    y = dcy - 1.85*cm
    box(cx-bw/2, y-1*cm, bw, 0.9*cm, "5. แสดงผลรูปภาพ ✅", "เรียงตามความแม่นยำ",
        bg=C_EMERALD)

    # No path (ไม่พบ)
    c.setStrokeColor(C_RED)
    c.setLineWidth(1.5)
    c.setDash([4,3])
    c.line(cx+2.6*cm, dcy, cx+4.2*cm, dcy)
    c.line(cx+4.2*cm, dcy, cx+4.2*cm, dcy+4*cm)
    c.line(cx+4.2*cm, dcy+4*cm, cx+0.3*cm, dcy+4*cm)
    c.setDash()
    c.setFillColor(C_RED)
    p4=c.beginPath();p4.moveTo(cx+0.3*cm,dcy+4*cm+5);p4.lineTo(cx+0.3*cm,dcy+4*cm-5);p4.lineTo(cx-0.3*cm,dcy+4*cm);p4.close();c.drawPath(p4,fill=1,stroke=0)
    c.setFont("Thai", 9)
    c.setFillColor(C_RED)
    c.drawString(cx+2.7*cm, dcy+0.2*cm, "ไม่พบ")
    c.drawString(cx+4.3*cm, dcy+2*cm, "ลดระดับ → ลองใหม่")

    # ── Flow: Admin ──────────────────────────────────────────────────────────
    cx2 = W*0.75
    bw2 = 5.8*cm

    c.setFont("ThaiBold", 11)
    c.setFillColor(C_EMERALD)
    c.drawCentredString(cx2, H-2.6*cm, "⚙  Admin (เพิ่มรูปภาพ)")

    # Separator line
    c.setStrokeColor(C_GRAY_LIGHT)
    c.setLineWidth(1.5)
    c.setDash([5,3])
    c.line(W/2, H-2.2*cm, W/2, 1.5*cm)
    c.setDash()

    y2 = H-3.4*cm
    box(cx2-bw2/2, y2-1*cm, bw2, 0.9*cm, "1. กดปุ่ม 'จัดการระบบ'", "มุมบนขวาของเว็บ", bg=C_EMERALD)
    arrow(cx2, y2-1*cm, cx2, y2-2.1*cm)
    y2 -= 2.1*cm
    box(cx2-bw2/2, y2-1*cm, bw2, 0.9*cm, "2. ใส่รหัสผ่าน", "กด 'เข้าสู่หน้าจัดการ'", bg=C_EMERALD)
    arrow(cx2, y2-1*cm, cx2, y2-2.1*cm)
    y2 -= 2.1*cm
    box(cx2-bw2/2, y2-1*cm, bw2, 0.9*cm, "3. วาง URL Google Drive", "ใส่ชื่อกิจกรรม/วันที่", bg=C_EMERALD)
    arrow(cx2, y2-1*cm, cx2, y2-2.1*cm)
    y2 -= 2.1*cm
    box(cx2-bw2/2, y2-1*cm, bw2, 0.9*cm, "4. กด 'เริ่ม Sync Drive'", "", bg=C_EMERALD)
    arrow(cx2, y2-1*cm, cx2, y2-2.3*cm)
    y2 -= 2.3*cm

    # Processing diamond
    dcy2 = y2-0.7*cm
    diamond(cx2, dcy2, 2.6*cm, 0.65*cm, "ประมวลผล...", bg=colors.HexColor("#059669"))
    arrow(cx2, dcy2-0.65*cm, cx2, dcy2-1.85*cm)
    y2 = dcy2-1.85*cm
    box(cx2-bw2/2, y2-1*cm, bw2, 0.9*cm, "5. Index สำเร็จ ✅", "รูปพร้อมค้นหาได้ทันที",
        bg=C_GREEN_DARK)

    # Legend
    legend_y = 1.4*cm
    c.setFillColor(C_GRAY_LIGHT)
    c.roundRect(1*cm, legend_y-0.3*cm, W-2*cm, 1.5*cm, 6, fill=1, stroke=0)
    c.setFont("ThaiBold", 10)
    c.setFillColor(C_GRAY)
    c.drawString(1.5*cm, legend_y+0.8*cm, "สัญลักษณ์:")
    items = [
        (C_GREEN, "ขั้นตอนปกติ"),
        (C_AMBER, "จุดตัดสินใจ"),
        (C_RED, "เส้นย้อนกลับ (ลองใหม่)"),
        (C_EMERALD, "ขั้นตอน Admin"),
    ]
    for i, (col, lbl) in enumerate(items):
        x_leg = 3.5*cm + i * 4.3*cm
        c.setFillColor(col)
        c.roundRect(x_leg, legend_y+0.5*cm, 0.7*cm, 0.4*cm, 3, fill=1, stroke=0)
        c.setFont("Thai", 10)
        c.setFillColor(C_DARK)
        c.drawString(x_leg+0.85*cm, legend_y+0.55*cm, lbl)

    c.setFont("Thai", 9)
    c.setFillColor(C_GRAY)
    c.drawCentredString(W/2, 0.5*cm, "FaceDeta — Flow การทำงาน | สำหรับพนักงานองค์กร")

    c.save()
    print(f"✅ PDF 3 สร้างแล้ว: {OUT}")
    return OUT


# ── Run ────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    p1 = make_manual()
    p2 = make_quickguide()
    p3 = make_flowchart()
    print("\n🎉 สร้าง PDF ครบ 3 ไฟล์แล้ว!")
    print(f"   📘 {p1}")
    print(f"   📗 {p2}")
    print(f"   📊 {p3}")
