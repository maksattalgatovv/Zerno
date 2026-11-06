"""Keyword-based demo assistant. No language model involved.

It recognises common questions and fills templates with real values from the farm data,
so answers stay truthful about the farm even though no LLM is running.
"""

import re

from app.adapters.llm.base import AssistantProvider

INTENTS: list[tuple[str, str]] = [
    ("ndvi", r"ndvi|индекс|индекс растит"),
    ("after_stress", r"stress|стресс|күйзеліс"),
    ("irrigation", r"irrigat|\bwater|полив|полив|орош|влаг|суар|ылғал"),
    ("inspect", r"inspect|which field|какое поле|какому полю|осмотр|провер|қай алқап|тексер"),
    ("poor_growth", r"poor|grow|плохо|растет|растёт|рост|нашар|өсі"),
]

TEXT: dict[str, dict[str, str]] = {
    "en": {
        "ndvi": "NDVI is a vegetation index from 0 to 1 that shows how green and dense plants are. A drone's special camera measures it using near-infrared light, so a normal phone photo can't produce it.\n\nA simple way to read it:\n• 0.6 or more: healthy\n• 0.4 to 0.6: needs attention\n• below 0.4: plants are stressed\n\nOn {farm}, the average is {avg}. {worst_name} is the lowest at {worst_ndvi}.",
        "poor": "{name} ({crop}) has the weakest growth on the farm: NDVI {ndvi}, status \"{health}\".{problems}\n\nThe uneven spots usually come from one of these, so check them on the ground:\n1. Soil moisture at root depth\n2. Plant colour: pale leaves can mean a nutrient shortage\n3. Weeds or leaf spots\n\nZERNO can show where to look, but only a field visit confirms the cause.",
        "inspect": "Start with {name}: NDVI {ndvi}, status \"{health}\".{problems}\n\nOrder of inspection:\n{order}",
        "irrigation": "Water only where the soil is really dry. For {farm} right now:\n\n• Forecast: {rain} mm of rain in the next 3 days. If rain is coming, wait.\n• Check soil moisture at root depth on {name} first, because it has the lowest NDVI ({ndvi}).\n• Water by zone, not the whole field. Use the map to see which zones are weak.\n\nThis weather forecast is demo data.",
        "stress": "After ZERNO detects crop stress:\n\n1. Open the map and find the exact spot.\n2. Visit it within 1 to 2 days and take close-up photos.\n3. Check soil moisture, then leaf colour, spots and pests.\n4. Run the photo through AI Crop Doctor.\n5. Ask an agronomist before using any chemical.\n6. Fly again in 5 to 7 days to compare.\n\nOn your farm, {name} is the first place to check.",
        "overview": "Here's the state of {farm}: {count} fields, {area} ha, average NDVI {avg}.\n\n{lines}\n\nYou can ask me what NDVI means, which field to inspect, or how to reduce irrigation.",
        "no_fields": "{farm} has no fields yet. Add a field first, and I'll be able to answer using its data.",
        "problems": " Open problem areas: {items}.",
        "no_ndvi": "no data yet",
        "notice": "Demo assistant: answers come from fixed templates filled with your farm data, not from an AI model.",
    },
    "ru": {
        "ndvi": "NDVI — индекс растительности от 0 до 1. Он показывает, насколько растения зелёные и густые. Его измеряет специальная камера дрона в ближнем инфракрасном свете, поэтому обычное фото с телефона для него не подходит.\n\nКак читать значения:\n• 0,6 и выше — здоровые растения\n• от 0,4 до 0,6 — требует внимания\n• ниже 0,4 — растения в стрессе\n\nВ хозяйстве «{farm}» среднее значение {avg}. Самое низкое — у поля «{worst_name}»: {worst_ndvi}.",
        "poor": "Самый слабый рост в хозяйстве — поле «{name}» ({crop}): NDVI {ndvi}, статус «{health}».{problems}\n\nОбычно неровный рост связан с одной из этих причин, проверьте их на месте:\n1. Влажность почвы на глубине корней\n2. Цвет растений: бледные листья могут означать нехватку питания\n3. Сорняки или пятна на листьях\n\nZERNO показывает, где смотреть, но подтвердить причину можно только в поле.",
        "inspect": "Начните с поля «{name}»: NDVI {ndvi}, статус «{health}».{problems}\n\nПорядок осмотра:\n{order}",
        "irrigation": "Поливайте только там, где почва действительно сухая. Для хозяйства «{farm}» сейчас:\n\n• Прогноз: {rain} мм осадков за 3 дня. Если ожидается дождь, подождите.\n• Сначала проверьте влажность почвы на поле «{name}»: там самый низкий NDVI ({ndvi}).\n• Поливайте по зонам, а не всё поле. Слабые зоны видны на карте.\n\nПрогноз погоды — демо-данные.",
        "stress": "Что делать после обнаружения стресса:\n\n1. Откройте карту и найдите точное место.\n2. Посетите его в течение 1–2 дней и сделайте фото вблизи.\n3. Проверьте влажность почвы, затем цвет листьев, пятна и вредителей.\n4. Загрузите фото в ИИ-доктор.\n5. Посоветуйтесь с агрономом перед применением химии.\n6. Повторите полёт через 5–7 дней и сравните.\n\nВ вашем хозяйстве в первую очередь проверьте поле «{name}».",
        "overview": "Состояние хозяйства «{farm}»: полей — {count}, площадь {area} га, средний NDVI {avg}.\n\n{lines}\n\nСпросите меня, что такое NDVI, какое поле осмотреть или как сократить полив.",
        "no_fields": "В хозяйстве «{farm}» пока нет полей. Добавьте поле, и я смогу отвечать по его данным.",
        "problems": " Открытые проблемные участки: {items}.",
        "no_ndvi": "нет данных",
        "notice": "Демо-ассистент: ответы составлены по шаблонам с данными вашего хозяйства, а не ИИ-моделью.",
    },
    "kk": {
        "ndvi": "NDVI — 0-ден 1-ге дейінгі өсімдік индексі. Ол өсімдіктердің қаншалықты жасыл әрі қалың екенін көрсетеді. Оны дронның арнайы камерасы инфрақызылға жақын жарықпен өлшейді, сондықтан қарапайым телефон фотосы жарамайды.\n\nМәндерді қалай оқу керек:\n• 0,6 және одан жоғары — сау\n• 0,4-тен 0,6-ға дейін — назар аудару керек\n• 0,4-тен төмен — өсімдіктер күйзелісте\n\n«{farm}» шаруашылығында орташа мән {avg}. Ең төменгісі — «{worst_name}»: {worst_ndvi}.",
        "poor": "Шаруашылықтағы ең әлсіз өсу — «{name}» алқабы ({crop}): NDVI {ndvi}, мәртебесі «{health}».{problems}\n\nБіркелкі емес өсу әдетте мына себептердің бірінен болады, оларды орнында тексеріңіз:\n1. Тамыр тереңдігіндегі топырақ ылғалдылығы\n2. Өсімдік түсі: бозғылт жапырақтар қоректік заттың жетіспеуін білдіруі мүмкін\n3. Арамшөптер немесе жапырақтағы дақтар\n\nZERNO қайда қарау керектігін көрсетеді, бірақ себепті тек алқапта растауға болады.",
        "inspect": "«{name}» алқабынан бастаңыз: NDVI {ndvi}, мәртебесі «{health}».{problems}\n\nТексеру реті:\n{order}",
        "irrigation": "Топырағы шынымен құрғақ жерді ғана суарыңыз. «{farm}» шаруашылығы үшін қазір:\n\n• Болжам: 3 күнде {rain} мм жауын-шашын. Жаңбыр күтілсе, күте тұрыңыз.\n• Алдымен «{name}» алқабындағы топырақ ылғалдылығын тексеріңіз: NDVI ең төмен ({ndvi}).\n• Бүкіл алқапты емес, аймақтар бойынша суарыңыз. Әлсіз аймақтар картада көрінеді.\n\nАуа райы болжамы — демо-деректер.",
        "stress": "Күйзеліс анықталғаннан кейін:\n\n1. Картаны ашып, нақты орнын табыңыз.\n2. 1–2 күн ішінде барып, жақыннан фото түсіріңіз.\n3. Топырақ ылғалдылығын, содан кейін жапырақ түсін, дақтарды және зиянкестерді тексеріңіз.\n4. Фотоны ЖИ-дәрігерге жүктеңіз.\n5. Химия қолданбас бұрын агрономмен кеңесіңіз.\n6. 5–7 күннен кейін қайта ұшырып, салыстырыңыз.\n\nСіздің шаруашылығыңызда алдымен «{name}» алқабын тексеріңіз.",
        "overview": "«{farm}» шаруашылығының жағдайы: алқап саны {count}, ауданы {area} га, орташа NDVI {avg}.\n\n{lines}\n\nNDVI деген не, қай алқапты тексеру керек немесе суаруды қалай азайтуға болатынын сұраңыз.",
        "no_fields": "«{farm}» шаруашылығында әзірге алқап жоқ. Алқап қосыңыз, сонда оның деректерімен жауап бере аламын.",
        "problems": " Ашық мәселелі учаскелер: {items}.",
        "no_ndvi": "дерек жоқ",
        "notice": "Демо-көмекші: жауаптар ЖИ моделінен емес, шаруашылық деректері қойылған үлгілерден алынады.",
    },
}


def detect_intent(question: str) -> str:
    lowered = question.lower()
    for intent, pattern in INTENTS:
        if re.search(pattern, lowered):
            return intent
    return "overview"


class DemoAssistant(AssistantProvider):
    provider_id = "demo-templates"
    is_demo = True

    def reply(self, context: dict, history: list[dict], question: str, lang: str) -> str:
        text = TEXT.get(lang, TEXT["en"])
        farm = context["farm"]["name"]
        fields = context["fields"]
        if not fields:
            return text["no_fields"].format(farm=farm)

        ranked = sorted(fields, key=lambda f: 9 if f["ndvi"] is None else f["ndvi"])
        worst = ranked[0]
        problems = (
            text["problems"].format(items=", ".join(worst["open_anomalies"]))
            if worst["open_anomalies"] else ""
        )
        common = {
            "farm": farm,
            "name": worst["name"],
            "crop": worst["crop"],
            "ndvi": self._num(worst["ndvi"], text),
            "health": worst["health"],
            "problems": problems,
            "avg": self._num(context["farm"]["avg_ndvi"], text),
        }

        intent = detect_intent(question)
        if intent == "ndvi":
            return text["ndvi"].format(worst_name=worst["name"], worst_ndvi=common["ndvi"], **common)
        if intent == "poor_growth":
            return text["poor"].format(**common)
        if intent == "inspect":
            order = "\n".join(
                f"{i}. {f['name']}: NDVI {self._num(f['ndvi'], text)}, {f['health']}"
                for i, f in enumerate(ranked, 1)
            )
            return text["inspect"].format(order=order, **common)
        if intent == "irrigation":
            return text["irrigation"].format(rain=context["weather"]["rain_next_3d_mm"], **common)
        if intent == "after_stress":
            return text["stress"].format(**common)

        lines = "\n".join(
            f"• {f['name']} ({f['crop']}, {f['area']} ha): NDVI {self._num(f['ndvi'], text)}, {f['health']}"
            for f in fields
        )
        return text["overview"].format(
            count=len(fields), area=context["farm"]["total_area"], lines=lines, **common
        )

    @staticmethod
    def _num(value: float | None, text: dict) -> str:
        return text["no_ndvi"] if value is None else f"{value:.2f}"
