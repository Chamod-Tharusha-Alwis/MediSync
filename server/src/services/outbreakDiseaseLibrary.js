'use strict';

/**
 * server/src/services/outbreakDiseaseLibrary.js
 *
 * Curated clinical and public health guidance for Sri Lanka communicable diseases.
 * Review status: Curated for viva demonstration; pending human clinical review.
 */

const CLINICAL_REVIEW_STATUS = 'Curated for viva demonstration; pending human clinical review';

const DISEASE_LIBRARY = {
  dengue: {
    canonicalName: 'Dengue Fever',
    icdCodes: ['A90', 'A91'],
    en: {
      about: 'Dengue is a viral infection transmitted to humans through the bites of infected female Aedes mosquitoes (primarily Aedes aegypti). It is hyperendemic in Sri Lanka with seasonal epidemic spikes.',
      symptoms: [
        'Sudden onset of high fever (typically 39-40°C)',
        'Severe frontal headache and retro-orbital (behind the eye) pain',
        'Severe muscle, bone, and joint aches ("breakbone fever")',
        'Nausea, vomiting, and loss of appetite',
        'Maculopapular rash appearing 3-5 days after fever onset'
      ],
      transmission: 'Transmitted by daytime-biting Aedes mosquitoes that breed in clean, stagnant water containers.',
      prevention: [
        'Inspect and eliminate mosquito breeding sites weekly (tires, gutters, plastic containers, coconut shells)',
        'Apply DEET or picaridin mosquito repellents on exposed skin and clothing',
        'Install wire mesh screens on windows and sleep under insecticide-treated bed nets',
        'Participate in community cleanup and fogging programs in high-risk Grama Niladhari divisions'
      ],
      highRisk: 'Children under 5, pregnant women, elderly individuals, and patients with diabetes, chronic renal failure, or previous dengue infection.',
      whenToSeekCare: 'Seek immediate emergency hospital care if experiencing red-flag symptoms: persistent vomiting, severe abdominal pain, mucosal bleeding (gums/nose), lethargy or restlessness, or fluid accumulation (pleural effusion/ascites).'
    },
    si: {
      about: 'ඩෙංගු යනු ඊඩිස් මදුරුවන් (ප්‍රධාන වශයෙන් ඊඩිස් ඊජිප්ටයි) දෂ්ට කිරීමෙන් බෝවන වෛරස් රෝගයකි. ශ්‍රී ලංකාවේ වැසි සහිත කාලවලදී බහුලව ව්‍යාප්ත වේ.',
      symptoms: [
        'හදිසියේ ඇතිවන අධික උණ (39-40°C)',
        'ඇස් පිටුපස තදබල වේදනාව සහ හිසරදය',
        'කැක්කුම සහ මාංශ පේශී/සන්ධි වේදනාව',
        'ඔක්කාරය, වමනය සහ කෑම අරුචිය',
        'සමේ ඇතිවන රතු පැහැති ලප හෝ බිබිලි'
      ],
      transmission: 'පිරිසිදු ජලය රැඳී ඇති ස්ථානවල බෝවන දිවා කාලයේ දෂ්ට කරන ඊඩිස් මදුරුවන් මඟින් බෝවේ.',
      prevention: [
        'සතියකට වරක් පරිශ්‍රයේ මදුරුවන් බෝවන ස්ථාන (ටයර්, ගලි, හිස් භාජන) ඉවත් කරන්න',
        'මදුරු විකර්ශක ආලේපන භාවිත කරන්න',
        'ජනෙල් සඳහා මදුරු දැල් යොදන්න සහ ඇඳ දැල් භාවිත කරන්න',
        'ප්‍රජා ඩෙංගු මර්දන වැඩසටහන් සඳහා සහභාගී වන්න'
      ],
      highRisk: 'අවුරුදු 5 ට අඩු දරුවන්, ගර්භනී මව්වරුන්, වැඩිහිටියන් සහ නිදන්ගත රෝගීන්.',
      whenToSeekCare: 'නොනවත්නා වමනය, දැඩි බඩේ කැක්කුම, විදුරුමහෙන් හෝ නාසයෙන් ලේ ගැලීම, අධික නිදිබර බව හෝ කලබලකාරී බව ඇති වුවහොත් වහාම රෝහල්ගත වන්න.'
    },
    ta: {
      about: 'டெங்கு என்பது ஏடிஸ் கொசுக்கள் கடிப்பதன் மூலம் பரவும் ஒரு வைரஸ் தொற்று நோயாகும். இது இலங்கையில் பருவமழைக் காலங்களில் தீவிரமாக பரவுகிறது.',
      symptoms: [
        'திடீரென ஏற்படும் தீவிர காய்ச்சல் (39-40°C)',
        'கண்களுக்குப் பின்னால் கடுமையான வலி மற்றும் தலைவலி',
        'மூட்டு மற்றும் தசை வலிகள்',
        'குமட்டல், வாந்தி மற்றும் பசியின்மை',
        'தோலில் ஏற்படும் சிவப்பு தடிப்புகள்'
      ],
      transmission: 'சுத்தமான தேங்கி நிற்கும் நீரில் உற்பத்தியாகும் பகல் நேரத்தில் கடிக்கும் ஏடிஸ் கொசுக்களால் பரவுகிறது.',
      prevention: [
        'வாரந்தோறும் கொசு உற்பத்தியாகும் இடங்களை (டயர்கள், சிரட்டைகள்) அழித்தல்',
        'கொசு விரட்டிகளைப் பயன்படுத்துதல்',
        'ஜன்னல்களுக்கு கொசு வலைகளைப் பொருத்துதல்',
        'சமூக கொசு ஒழிப்பு நடவடிக்கைகளில் பங்கெடுத்தல்'
      ],
      highRisk: '5 வயதுக்குட்பட்ட குழந்தைகள், கர்ப்பிணிப் பெண்கள், முதியவர்கள் மற்றும் நாள்பட்ட நோயாளிகள்.',
      whenToSeekCare: 'தொடர்ச்சியான வாந்தி, கடுமையான வயிற்று வலி, ஈறுகள் அல்லது மூக்கிலிருந்து இரத்தக்கசிவு, அதீத சோர்வு ஏற்பட்டால் உடனடியாக மருத்துவமனைக்குச் செல்லவும்.'
    }
  },

  leptospirosis: {
    canonicalName: 'Leptospirosis (Rat Fever)',
    icdCodes: ['A27'],
    en: {
      about: 'Leptospirosis is a bacterial zoonosis caused by Leptospira interrogans, shed in the urine of infected rodents and farm animals. Paddy farmers, canal cleaners, and flood-exposed residents in the wet zone are at highest risk.',
      symptoms: [
        'High swinging fever, chills, and rigors',
        'Severe muscle tenderness, particularly in the calves and lumbar region',
        'Conjunctival suffusion (redness of the eyes without discharge)',
        'Oliguria (reduced urine output) and dark-colored urine',
        'Jaundice appearing within 3-6 days in severe cases (Weil disease)'
      ],
      transmission: 'Bacterial penetration through broken skin, abrasions, or mucous membranes following contact with water or soil contaminated with infected animal urine.',
      prevention: [
        'Take weekly prophylactic Doxycycline (200mg) as prescribed by the local MOH before engaging in high-risk agricultural or flood work',
        'Wear protective rubber boots and heavy gloves when working in paddy fields or clearing drainage canals',
        'Cover all cuts and skin wounds with waterproof dressings before touching mud or water',
        'Control rodent populations around dwellings, paddy storage sheds, and livestock areas'
      ],
      highRisk: 'Paddy farmers, agricultural laborers, municipal sanitation workers, and persons exposed to stagnant flood water.',
      whenToSeekCare: 'Seek immediate care at the nearest hospital upon fever onset following soil or water exposure. Do not wait for jaundice or reduced urination to develop.'
    },
    si: {
      about: 'මී උණ (ලෙප්ටොස්පයිරෝසිස්) යනු ආසාදිත මීයන් සහ ගොවිපළ සතුන්ගේ මුත්‍රා මඟින් පරිසරයට මුදාහැරෙන බැක්ටීරියාවක් මඟින් බෝවන රෝගයකි. කුඹුරු ගොවීන් සහ ගංවතුරට නිරාවරණය වන්නන් වැඩි අවදානමක පසුවේ.',
      symptoms: [
        'වෙවුලුම සහිත අධික උණ සහ දැඩි හිසරදය',
        'කෙණ්ඩ පෙරළීම සහ මාංශ පේශීවල තදබල වේදනාව',
        'ඇස් රතුවීම (කඳුළු හෝ කබ ගැලීමකින් තොරව)',
        'මුත්‍රා පිටවීම අඩුවීම සහ තද පැහැති මුත්‍රා',
        'සම සහ ඇස් කහ පැහැවීම (සෙංගමාල ලක්ෂණ)'
      ],
      transmission: 'තුවාල හෝ සීරීම් සහිත සම මඟින් ආසාදිත සත්ව මුත්‍රා මිශ්‍ර ජලය හෝ පස් ශරීරගත වීමෙන් බෝවේ.',
      prevention: [
        'කුඹුරු වැඩට පෙර ප්‍රාදේශීය සෞඛ්‍ය වෛද්‍ය නිලධාරී නිර්දේශය පරිදි ඩොක්සිසයික්ලීන් පෙති ලබා ගන්න',
        'මඩ හෝ ජලයට බැසීමේදී ආරක්ෂිත බූට් සපත්තු සහ අත්වැසුම් පළඳින්න',
        'සමේ ඇති තුවාල ජලයට ඔරොත්තු දෙන ප්ලාස්ටර් මඟින් ආවරණය කරන්න',
        'ධාන්‍ය ගබඩා සහ නිවාස අවට මීයන් මර්දනය කරන්න'
      ],
      highRisk: 'ගොවීන්, පිරිසිදු කිරීමේ කම්කරුවන් සහ ගංවතුරට නිරාවරණය වූ පුද්ගලයින්.',
      whenToSeekCare: 'කුඹුරු හෝ මඩ සහිත ජලයට නිරාවරණය වීමෙන් පසු උණ හෝ ඇඟපත වේදනාව ඇති වුවහොත් වහාම වෛද්‍ය ප්‍රතිකාර ලබා ගන්න.'
    },
    ta: {
      about: 'எலிக் காய்ச்சல் (லெப்டோஸ்பைரோசிஸ்) என்பது எலிகள் மற்றும் விலங்குகளின் சிறுநீர் கலந்த நீரினால் பரவும் பக்டீரியா தொற்றாகும். விவசாயிகள் மற்றும் வெள்ள நீரினால் பாதிக்கப்பட்டவர்கள் அதிக ஆபத்தில் உள்ளனர்.',
      symptoms: [
        'குளிருடன் கூடிய அதிக காய்ச்சல்',
        'கால் தசைகளில் கடுமையான வலி மற்றும் தசைப்பிடிப்பு',
        'கண்கள் சிவத்தல்',
        'சிறுநீர் வெளியேற்றம் குறைதல்',
        'தோல் மற்றும் கண்கள் மஞ்சள் நிறமாதல்'
      ],
      transmission: 'தோலில் உள்ள வெட்டுக்காயங்கள் மூலம் பாதிக்கப்பட்ட நீர் உடலுக்குள் செல்வதால் பரவுகிறது.',
      prevention: [
        'வயல் வேலைக்கு முன் சுகாதார அதிகாரிகளின் அறிவுறுத்தலின்படி டாக்ஸிசைக்ளின் மாத்திரைகளை உட்கொள்ளுதல்',
        'பாதுகாப்பு பூட்ஸ் மற்றும் கையுறைகளை அணிதல்',
        'காயங்களை நீர்ப்புகா பட்டிகளால் மூடுதல்',
        'எலிகளைக் கட்டுப்படுத்துதல்'
      ],
      highRisk: 'விவசாயிகள், வடிகால் துப்புரவுத் தொழிலாளர்கள் மற்றும் வெள்ளத்தால் பாதிக்கப்பட்டவர்கள்.',
      whenToSeekCare: 'சேற்று நீரில் வேலை செய்த பின் காய்ச்சல் அல்லது தசை வலி ஏற்பட்டால் உடனடியாக மருத்துவமனைக்குச் செல்லவும்.'
    }
  },

  influenza: {
    canonicalName: 'Influenza / Acute Respiratory Infection',
    icdCodes: ['J10', 'J11', 'J06', 'J18'],
    en: {
      about: 'Influenza is an acute contagious viral respiratory infection affecting the nose, throat, and lungs. Seasonal peaks occur in Sri Lanka during monsoon periods (May-July and November-January).',
      symptoms: [
        'Sudden fever and chills',
        'Persistent dry cough, sore throat, and hoarseness',
        'Nasal congestion and rhinorrhea (runny nose)',
        'Generalized body aches and marked fatigue',
        'Shortness of breath or rapid breathing in severe respiratory presentations'
      ],
      transmission: 'Airborne droplet transmission generated through coughing, sneezing, or talking, and contact with contaminated surfaces (fomites).',
      prevention: [
        'Cover mouth and nose with a tissue or bent elbow when coughing or sneezing',
        'Wash hands frequently with soap and water or use alcohol hand rub',
        'Wear a well-fitted mask in crowded indoor or healthcare environments',
        'Stay home from work or school when symptomatic to avoid infecting others'
      ],
      highRisk: 'Infants, adults aged 65+, pregnant women, and individuals with asthma, chronic lung disease, or compromised immunity.',
      whenToSeekCare: 'Seek urgent hospital evaluation if chest pain, breathing difficulty, persistent high fever (>3 days), or blue coloration of lips/face occurs.'
    },
    si: {
      about: 'ඉන්ෆ්ලුවෙන්සා යනු ශ්වසන පද්ධතියට බලපාන උග්‍ර වෛරස් ආසාදනයකි. ශ්‍රී ලංකාවේ මෝසම් වැසි සමයන්හිදී (මැයි-ජූලි සහ නොවැම්බර්-ජනවාරි) ව්‍යාප්තිය ඉහළ යයි.',
      symptoms: [
        'හදිසියේ ඇතිවන උණ සහ වෙවුලුම',
        'වියළි කැස්ස, උගුරේ අමාරුව සහ හඬ ගොරෝසු වීම',
        'නාසයෙන් සොටු දියර ගැලීම හෝ නාසය හිරවීම',
        'ඇඟපත තදබල වේදනාව සහ අධික තෙහෙට්ටුව',
        'හුස්ම ගැනීමේ අපහසුව (දරුණු අවස්ථාවලදී)'
      ],
      transmission: 'කැස්ස, කිවිසුම් මඟින් වාතයට මුදාහැරෙන කෙළ බිඳිති ආශ්වාස කිරීමෙන් හෝ ආසාදිත මතුපිටවල් ඇල්ලීමෙන් බෝවේ.',
      prevention: [
        'කහින විට හෝ කිවිසුම් යවන විට වැලමිට ඇතුළතින් හෝ ටිෂූ එකකින් මුඛය ආවරණය කරගන්න',
        'සබන් යොදා නිතර දෑත් සෝදන්න',
        'ජනාකීර්ණ ස්ථානවල මුව ආවරණ (මාස්ක්) පළඳින්න',
        'රෝග ලක්ෂණ ඇත්නම් නිවසේ විවේක ගන්න'
      ],
      highRisk: 'කුඩා දරුවන්, වයෝවෘද්ධ පුද්ගලයින්, ගර්භනී මව්වරුන් සහ ඇදුම/නිදන්ගත පෙනහළු රෝගීන්.',
      whenToSeekCare: 'හුස්ම ගැනීමේ අපහසුව, පපුවේ වේදනාව, දින 3කට වඩා පවතින උණ හෝ තොල් නිල් පැහැවීම දුටුවහොත් වහාම වෛද්‍යවරයකු හමුවන්න.'
    },
    ta: {
      about: 'இன்புளுவென்சா என்பது சுவாசப்பாதையை தாக்கும் கடுமையான வைரஸ் தொற்று ஆகும். பருவமழை காலங்களில் இதன் பரவல் அதிகமாக இருக்கும்.',
      symptoms: [
        'திடீர் காய்ச்சல் மற்றும் நடுக்கம்',
        'இருமல், தொண்டை வலி',
        'மூக்கடைப்பு மற்றும் மூக்கொழுகுதல்',
        'உடல் வலி மற்றும் சோர்வு',
        'மூச்சுத்திணறல்'
      ],
      transmission: 'தும்மல் மற்றும் இருமலின் போது வெளிப்படும் நீர்த்துளிகள் மூலம் பரவுகிறது.',
      prevention: [
        'இருமும் போது வாயை மூடிக்கொள்ளுதல்',
        'கைகளை அடிக்கடி சவர்க்காரமிட்டு கழுவுதல்',
        'முகக்கவசம் அணிதல்',
        'நோய்த்தொற்று உள்ளபோது வீட்டில் தங்குதல்'
      ],
      highRisk: 'கைக்குழந்தைகள், முதியவர்கள், கர்ப்பிணிகள் மற்றும் ஆஸ்துமா நோயாளிகள்.',
      whenToSeekCare: 'மூச்சு எடுப்பதில் சிரமம், நெஞ்சு வலி ஏற்பட்டால் உடனடியாக மருத்துவ உதவியை நாடவும்.'
    }
  },

  typhoid: {
    canonicalName: 'Typhoid / Enteric Fever',
    icdCodes: ['A01'],
    en: {
      about: 'Typhoid fever is a life-threatening systemic infection caused by Salmonella enterica serovar Typhi, contracted through ingestion of contaminated food or water in areas with compromised sanitation.',
      symptoms: [
        'Steadily rising prolonged fever (step-ladder pattern up to 40°C)',
        'Severe headache, malaise, and generalized body weakness',
        'Abdominal pain, constipation early or diarrhea later ("pea-soup")',
        'Relative bradycardia (slow pulse despite high fever)',
        'Rose-colored spots on chest and abdomen in fair-skinned patients'
      ],
      transmission: 'Fecal-oral route through contaminated drinking water, unwashed fresh produce, or food handled by infected persons.',
      prevention: [
        'Drink only rolling-boiled (min 1 minute) or chemically treated water',
        'Eat foods that are thoroughly cooked and served steaming hot',
        'Wash hands vigorously with soap before food preparation and eating',
        'Avoid consuming raw salads, cut fruits, and untreated street food ice'
      ],
      highRisk: 'Children, travelers, household contacts of chronic typhoid carriers, and populations in low-sanitation settlements.',
      whenToSeekCare: 'Consult a physician promptly for unremitting fever lasting more than 4 days. Emergency care is needed if severe stomach pain, gastrointestinal bleeding, or acute delirium develops.'
    },
    si: {
      about: 'ටයිෆොයිඩ් (ආන්ත්‍රික උණ) යනු සැල්මොනෙල්ලා ටයිෆි බැක්ටීරියාව මඟින් අපිරිසිදු ආහාර සහ පානීය ජලය හරහා බෝවන දරුණු ආසාදනයකි.',
      symptoms: [
        'දිනෙන් දින ඉහළ යන දිගුකාලීන උණ',
        'දැඩි හිසරදය, ඇඟපත තෙහෙට්ටුව සහ අප්‍රාණික බව',
        'බඩේ කැක්කුම, බද්ධය හෝ පාචනය',
        'උණ ඉහළ ගියද හෘද ස්පන්දන වේගය සාපේක්ෂව අඩුවීම',
        'පපුව හෝ උදරය මත රතු පැහැති කුඩා ලප මතුවීම'
      ],
      transmission: 'මලපහ මඟින් අපවිත්‍ර වූ පානීය ජලය හෝ ආහාර අනුභව කිරීමෙන් බෝවේ.',
      prevention: [
        'නටවා නිවාගත් පිරිසිදු ජලය පමණක් පානය කරන්න',
        'නැවුම්ව සහ හොඳින් පිසූ උණුසුම් ආහාර පමණක් අනුභව කරන්න',
        'ආහාර ගැනීමට පෙර සහ වැසිකිළි භාවිතයෙන් පසු සබන් යොදා අත් සෝදන්න',
        'අපිරිසිදු ජලයෙන් සෑදූ අයිස් හෝ කපා විවෘතව තැබූ පළතුරු අනුභවයෙන් වළකින්න'
      ],
      highRisk: 'පාසල් දරුවන්, අඩු සනීපාරක්ෂක පහසුකම් සහිත ප්‍රදේශවල පදිංචිකරුවන්.',
      whenToSeekCare: 'දින 4කට වඩා නොකඩවා පවතින උණක් ඇත්නම් වහාම වෛද්‍ය ප්‍රතිකාර ලබා ගන්න.'
    },
    ta: {
      about: 'டைபாய்டு என்பது சால்மோனெல்லா டைபி என்ற பக்டீரியாவினால் அசுத்தமான உணவு மற்றும் நீர் மூலம் பரவும் தீவிர நோய்த்தொற்றாகும்.',
      symptoms: [
        'படிப்படியாக அதிகரிக்கும் தொடர் காய்ச்சல்',
        'கடுமையான தலைவலி மற்றும் உடல் சோர்வு',
        'வயிற்று வலி, மலச்சிக்கல் அல்லது வயிற்றுப்போக்கு',
        'நெஞ்சுப் பகுதியில் சிறிய இளஞ்சிவப்பு புள்ளிகள்'
      ],
      transmission: 'அசுத்தமான குடிநீர் மற்றும் சுகாதாரமற்ற உணவுகள் மூலம் பரவுகிறது.',
      prevention: [
        'கொதித்து ஆறிய நீரையே அருந்துதல்',
        'நன்றாக சமைக்கப்பட்ட சூடான உணவுகளை உண்ணுதல்',
        'உணவு உண்பதற்கு முன் கைகளை சவர்க்காரமிட்டு கழுவுதல்',
        'வெளியிடங்களில் விற்கப்படும் வெட்டப்பட்ட பழங்களை தவிர்த்தல்'
      ],
      highRisk: 'சிறுவர்கள் மற்றும் சுகாதார வசதிகள் குறைந்த இடங்களில் வசிப்பவர்கள்.',
      whenToSeekCare: '4 நாட்களுக்கு மேல் காய்ச்சல் தொடர்ந்தால் உடனடியாக மருத்துவரை அணுகவும்.'
    }
  },

  chickenpox: {
    canonicalName: 'Chickenpox / Varicella',
    icdCodes: ['B01'],
    en: {
      about: 'Chickenpox is a highly contagious disease caused by the Varicella Zoster Virus (VZV). It causes an itchy vesicular skin rash across crops over several days.',
      symptoms: [
        'Moderate fever, loss of appetite, and headache',
        'Itchy rash that begins on the trunk and face before spreading to extremities',
        'Progression from macules to papules to fluid-filled teardrop vesicles, then crusts',
        'Lesions present simultaneously in all stages of development ("pleomorphism")'
      ],
      transmission: 'Direct contact with skin vesicles, aerosolized vesicle fluid, or respiratory droplets from infected individuals.',
      prevention: [
        'Isolate infected individuals until all blister lesions have fully crusted over (typically 6-7 days)',
        'Maintain hand hygiene and disinfect shared household articles',
        'Trim fingernails short to prevent secondary bacterial skin infections from scratching',
        'Consult healthcare providers regarding post-exposure prophylaxis for high-risk contacts'
      ],
      highRisk: 'Neonates, pregnant women without immunity (risk of congenital varicella), and immunocompromised individuals.',
      whenToSeekCare: 'Seek prompt medical evaluation if skin blisters become swollen/red with pus, or if severe cough, breathing difficulty, or confusion occurs.'
    },
    si: {
      about: 'පැපොල (චිකන්පොක්ස්) යනු වැරිසෙල්ලා සොස්ටර් වෛරසය මඟින් බෝවන අතිශය බෝවනසුලු චර්ම රෝගයකි.',
      symptoms: [
        'මධ්‍යස්ථ උණ, කෑම අරුචිය සහ හිසරදය',
        'කඳ සහ මුහුණෙන් පටන් ගෙන අත් පා දක්වා පැතිරෙන කැසීම සහිත බිබිලි',
        'දියර පිරුණු බිබිලි බවට පත්වී පසුව වේලී කබොලු බවට පත්වීම',
        'එකම අවස්ථාවේ විවිධ අවධිවල පවතින බිබිලි දැකිය හැකි වීම'
      ],
      transmission: 'බිබිලිවලින් පිටවන දියර සෘජුව ස්පර්ශ වීමෙන් හෝ කැස්ස/කිවිසුම් කෙළ බිඳිති මඟින් බෝවේ.',
      prevention: [
        'සියලු බිබිලි වේලී කබොලු හැලෙන තුරු රෝගියා වෙනම කාමරයක තබා ගන්න',
        'කැසීමෙන් වැළකීමට නියපොතු කොටට කපන්න (බැක්ටීරියා ආසාදන වැළැක්වීමට)',
        'අත් නිතර සබන් යොදා සෝදන්න සහ පෞද්ගලික ද්‍රව්‍ය බෙදාගැනීමෙන් වළකින්න'
      ],
      highRisk: 'නූපන් දරුවන්, ගර්භනී කාන්තාවන් සහ ප්‍රතිශක්තිය දුර්වල පුද්ගලයින්.',
      whenToSeekCare: 'බිබිලි පැසවීම, පපුවේ වේදනාව, හුස්ම ගැනීමේ අපහසුව හෝ අධික නිදිමත බව ඇති වුවහොත් වහාම වෛද්‍ය ප්‍රතිකාර ලබා ගන්න.'
    },
    ta: {
      about: 'சின்னம்மை என்பது வரிசெல்லா சோஸ்டர் வைரஸினால் ஏற்படும் தீவிரமாக பரவக்கூடிய ஒரு நோய்த்தொற்றாகும்.',
      symptoms: [
        'மிதமான காய்ச்சல், பசியின்மை',
        'உடலில் தோன்றி பரவும் அரிப்புடன் கூடிய கொப்புளங்கள்',
        'நீர்க்கொப்புளங்கள் பின்னர் காய்ந்து உதிர்தல்'
      ],
      transmission: 'கொப்புளங்களின் நீரை தொடுவதாலும், சுவாசம் மூலமும் பரவுகிறது.',
      prevention: [
        'கொப்புளங்கள் முழுமையாக ஆறும் வரை தனிமைப்படுத்தல்',
        'கைகளை சுத்தமாக வைத்திருத்தல்',
        'நகங்களை வெட்டி சுத்தமாக வைத்தல்'
      ],
      highRisk: 'கர்ப்பிணிப் பெண்கள், பச்சிளங்குழந்தைகள் மற்றும் நோயெதிர்ப்பு சக்தி குறைந்தவர்கள்.',
      whenToSeekCare: 'கொப்புளங்களில் சீழ் வடிந்தாலோ அல்லது மூச்சுத்திணறல் ஏற்பட்டாலோ உடனடியாக மருத்துவரை அணுகவும்.'
    }
  },

  hepatitis_a: {
    canonicalName: 'Hepatitis A',
    icdCodes: ['B15'],
    en: {
      about: 'Hepatitis A is an acute inflammatory liver disease caused by the Hepatitis A virus (HAV). It is usually self-limiting and does not cause chronic liver disease, but can cause debilitating acute illness.',
      symptoms: [
        'Fatigue, nausea, vomiting, and abdominal discomfort in the upper right quadrant',
        'Loss of appetite and low-grade fever',
        'Dark amber or tea-colored urine',
        'Pale, clay-colored bowel movements',
        'Jaundice (yellowing of eyes and skin) appearing after prodromal symptoms'
      ],
      transmission: 'Fecal-oral route through ingestion of water or food contaminated with feces of an infected person, or close personal contact.',
      prevention: [
        'Drink only reliably treated or boiled water',
        'Practice rigorous hand washing with soap before eating and after using the restroom',
        'Ensure sanitary disposal of human feces and protect community water catchments',
        'Wash vegetables and fruits thoroughly with clean water before peeling or eating'
      ],
      highRisk: 'Individuals with preexisting chronic liver disease, travelers to high-endemic areas, and contacts of infected household members.',
      whenToSeekCare: 'Consult a physician upon observing jaundice or persistent dark urine. Immediate care is needed if severe vomiting prevents hydration or confusion develops.'
    },
    si: {
      about: 'හෙපටයිටිස් A යනු අපිරිසිදු ආහාර සහ ජලය මඟින් අක්මාවට බලපාන උග්‍ර වෛරස් ආසාදනයකි (සෙංගමාලය).',
      symptoms: [
        'අධික තෙහෙට්ටුව, ඔක්කාරය, වමනය සහ බඩේ දකුණු පැත්තේ උඩ කොටසේ කැක්කුම',
        'කෑම අරුචිය සහ මද උණ',
        'තේ කහට පැහැති තද මුත්‍රා පිටවීම',
        'සුදුමැලි (මැටි පැහැති) මලපහ පිටවීම',
        'ඇස් සහ සම කහ පැහැවීම'
      ],
      transmission: 'ආසාදිත මලපහ මඟින් අපවිත්‍ර වූ ජලය හෝ ආහාර ශරීරගත වීමෙන් බෝවේ.',
      prevention: [
        'උණුකර නිවාගත් ජලය පමණක් පානය කරන්න',
        'ආහාර ගැනීමට පෙර සහ වැසිකිළි භාවිතයෙන් පසු සබන් යොදා අත් සෝදන්න',
        'පිරිසිදු සනීපාරක්ෂක වැසිකිළි පමණක් භාවිත කරන්න',
        'එළවළු සහ පලතුරු පිරිසිදු ජලයෙන් හොඳින් සෝදන්න'
      ],
      highRisk: 'නිදන්ගත අක්මා රෝග ඇති පුද්ගලයින් සහ කුඩා දරුවන්.',
      whenToSeekCare: 'ඇස් හෝ සම කහ පැහැවීම දුටුවහොත් වහාම වෛද්‍යවරයකු හමුවන්න.'
    },
    ta: {
      about: 'ஹெபடைடிஸ் A என்பது அசுத்தமான உணவு மற்றும் நீர் மூலம் பரவும் கல்லீரல் அழற்சி நோயாகும் (மஞ்சள் காமாலை).',
      symptoms: [
        'அதிக சோர்வு, குமட்டல், வாந்தி',
        'வயிற்றின் வலது மேல் பகுதியில் வலி',
        'தேநீர் போன்ற அடர்ந்த சிறுநீர்',
        'வெளிறிய மலம்',
        'கண்கள் மற்றும் தோல் மஞ்சள் நிறமாதல்'
      ],
      transmission: 'அசுத்தமான உணவு மற்றும் குடிநீர் மூலம் பரவுகிறது.',
      prevention: [
        'கொதித்தாறிய நீரைக் குடித்தல்',
        'கைகளை சுத்தமாக கழுவுதல்',
        'சுகாதாரமான மலசலகூடங்களை பயன்படுத்துதல்'
      ],
      highRisk: 'கல்லீரல் நோய் உள்ளவர்கள் மற்றும் குழந்தைகள்.',
      whenToSeekCare: 'கண்கள் மஞ்சள் நிறமானால் உடனடியாக மருத்துவரை அணுகவும்.'
    }
  },

  cholera: {
    canonicalName: 'Cholera / Acute Watery Diarrhea',
    icdCodes: ['A00'],
    en: {
      about: 'Cholera is an acute diarrhoeal infection caused by ingestion of food or water contaminated with the bacterium Vibrio cholerae. It can cause severe dehydration and death within hours if left untreated.',
      symptoms: [
        'Profuse, painless watery diarrhea resembling "rice-water"',
        'Rapid dehydration (sunken eyes, dry mouth, skin tenting, cold clammy extremities)',
        'Vomiting accompanying watery stools',
        'Rapid, weak pulse and dangerously low blood pressure',
        'Severe muscle cramps resulting from rapid electrolyte and fluid loss'
      ],
      transmission: 'Fecal-oral transmission through consuming municipal or surface water supplies contaminated with untreated human feces.',
      prevention: [
        'Boil all drinking water vigorously or treat with certified chlorine tablets',
        'Begin early oral rehydration salts (ORS) immediately at the onset of severe watery diarrhea',
        'Wash hands thoroughly with soap after defecating and before eating or handling food',
        'Cook all seafood, shellfish, and vegetables thoroughly before consumption'
      ],
      highRisk: 'Residents of urban settlements with informal water connections, displaced populations, and individuals with malnutrition or severe anemia.',
      whenToSeekCare: 'Medical emergency: transport anyone with profuse watery diarrhea immediately to the nearest hospital for IV fluid replacement.'
    },
    si: {
      about: 'කොලරාව (උග්‍ර ජලමය පාචනය) යනු විබ්‍රියෝ කොලරේ බැක්ටීරියාව මඟින් අපිරිසිදු පානීය ජලය හෝ ආහාර හරහා ඉතා වේගයෙන් විජලනය ඇති කර මරණය පවා ගෙනදිය හැකි භයානක රෝගයකි.',
      symptoms: [
        'වේදනාවකින් තොරව පිටවන කැඳ වතුර වැනි අධික ජලමය පාචනය',
        'වේගවත් විජලනය (ඇස් ගිලී යාම, වියළි දිව, සම රැලි වැටීම)',
        'පාචනය සමඟ ඇතිවන වමනය',
        'මාංශ පේශී පෙරළීම සහ දැඩි ඇඟපත වේදනාව',
        'රුධිර පීඩනය අඩුවීම සහ ක්ලාන්තය'
      ],
      transmission: 'මලපහ අපද්‍රව්‍ය මිශ්‍ර වූ අපිරිසිදු පානීය ජලය හෝ ආහාර මඟින් බෝවේ.',
      prevention: [
        'බීමට ගන්නා සියලු ජලය හොඳින් නටවා නිවා පානය කරන්න හෝ ක්ලෝරීන් යොදා පිරිසිදු කරන්න',
        'පාචනය ආරම්භ වූ වහාම ජීවනී (ORS) ලබා දීම ආරම්භ කරන්න',
        'වැසිකිළි භාවිතයෙන් පසු සහ ආහාර පිළියෙල කිරීමට පෙර සබන් යොදා අත් සෝදන්න'
      ],
      highRisk: 'පිරිසිදු පානීය ජලය නොමැති ප්‍රදේශවල ජනතාව සහ කුඩා දරුවන්.',
      whenToSeekCare: 'හදිසි අවස්ථාවකි: කැඳ වතුර වැනි පාචනයක් ඇති වුවහොත් කිසිදු ප්‍රමාදයකින් තොරව රෝගියා ළඟම ඇති රජයේ රෝහල වෙත රැගෙන යන්න.'
    },
    ta: {
      about: 'வாந்திபேதி (கொலரா) என்பது விப்ரியோ கொலரே பக்டீரியாவினால் பரவும் கடுமையான நீரிழப்பை ஏற்படுத்தும் ஒரு தீவிர நோயாகும்.',
      symptoms: [
        'கஞ்சித் தண்ணீர் போன்ற தீவிர வயிற்றுப்போக்கு',
        'விரைவான நீரிழப்பு (கண்கள் குழிவிழுதல், வாய் வறட்சி)',
        'வாந்தி மற்றும் தசைப்பிடிப்பு',
        'குறைந்த இரத்த அழுத்தம் மற்றும் மயக்கம்'
      ],
      transmission: 'மலம் கலந்த அசுத்தமான குடிநீர் மூலம் பரவுகிறது.',
      prevention: [
        'நீரைக் கொதிக்க வைத்து குடித்தல்',
        'உடனடியாக ஜீவனி (ORS) கரைசலை பருகுதல்',
        'கைகளை சவர்க்காரமிட்டு கழுவுதல்'
      ],
      highRisk: 'சுத்தமான குடிநீர் வசதியற்ற மக்கள் மற்றும் சிறுவர்கள்.',
      whenToSeekCare: 'அவசர நிலை: கஞ்சி போன்ற வயிற்றுப்போக்கு ஏற்பட்டால் உடனடியாக நோயாಳியை மருத்துவமனைக்கு கொண்டு செல்லவும்.'
    }
  },

  chikungunya: {
    canonicalName: 'Chikungunya',
    icdCodes: ['A920', 'A92.0'],
    en: {
      about: 'Chikungunya is a mosquito-borne viral disease caused by the chikungunya virus (CHIKV), transmitted by Aedes mosquitoes. It characteristically causes severe, often disabling arthralgia (joint pain) that can persist for months.',
      symptoms: [
        'Abrupt onset of high fever and severe incapacitating joint pain',
        'Swelling and stiffness in bilateral small joints (wrists, ankles, fingers)',
        'Muscle pain, headache, and fatigue',
        'Maculopapular rash appearing 2-5 days after fever onset'
      ],
      transmission: 'Transmitted by bites of infected Aedes aegypti and Aedes albopictus mosquitoes during daytime hours.',
      prevention: [
        'Eradicate domestic and peridomestic mosquito breeding sites weekly',
        'Wear long-sleeved light-colored clothing and apply insect repellent',
        'Screen living spaces and use bed nets during daytime resting hours'
      ],
      highRisk: 'Newborns exposed during delivery, older adults (65+), and patients with underlying hypertension, diabetes, or cardiovascular disease.',
      whenToSeekCare: 'Seek medical assessment for clinical diagnosis and pain management. Urgent care is warranted if joint swelling prevents mobility or persistent high fever continues.'
    },
    si: {
      about: 'චිකුන්ගුන්යා යනු ඊඩිස් මදුරුවන් මඟින් බෝවන, විශේෂයෙන්ම සන්ධිවල දැඩි වේදනාවක් සහ ඉදිමීමක් ඇති කරන වෛරස් රෝගයකි.',
      symptoms: [
        'හදිසියේ ඇතිවන අධික උණ සහ දරාගත නොහැකි සන්ධි වේදනාව',
        'මැණික් කටුව, වළලුකර සහ ඇඟිලි සන්ධිවල ඉදිමීම සහ තදබව',
        'මාංශ පේශී වේදනාව සහ හිසරදය',
        'සමේ ඇතිවන රතු පැහැති ලප හෝ බිබිලි'
      ],
      transmission: 'දිවා කාලයේ දෂ්ට කරන ඊඩිස් ඊජිප්ටයි සහ ඊඩිස් ඇල්බොපික්ටස් මදුරුවන් මඟින් බෝවේ.',
      prevention: [
        'මදුරුවන් බෝවන ස්ථාන සතියකට වරක් විනාශ කරන්න',
        'ශරීරය හොඳින් ආවරණය වන ඇඳුම් පළඳින්න සහ මදුරු විකර්ශක ආලේපන භාවිත කරන්න',
        'දිවා කාලයේ නිදාගන්නේ නම් මදුරු දැල් භාවිත කරන්න'
      ],
      highRisk: 'වැඩිහිටියන්, කුඩා දරුවන් සහ නිදන්ගත රෝගීන්.',
      whenToSeekCare: 'දැඩි සන්ධි වේදනාව හෝ උණ පවතී නම් සුදුසුකම්ලත් වෛද්‍යවරයකු හමුවන්න.'
    },
    ta: {
      about: 'சிக்குன்குனியா என்பது ஏடிஸ் கொசுக்களால் பரவும் கடுமையான மூட்டு வலியை ஏற்படுத்தும் வைரஸ் தொற்று ஆகும்.',
      symptoms: [
        'திடீர் அதிக காய்ச்சல் மற்றும் கடுமையான மூட்டு வலி',
        'மூட்டுகளில் வீக்கம் மற்றும் விறைப்பு',
        'தசை வலி, தலைவலி',
        'தோலில் தடிப்புகள்'
      ],
      transmission: 'பகலில் கடிக்கும் ஏடிஸ் கொசுக்கள் மூலம் பரவுகிறது.',
      prevention: [
        'கொசு உற்பத்தியாகும் இடங்களை அழித்தல்',
        'உடலை மூடும் ஆடைகளை அணிதல் மற்றும் கொசு விரட்டிகளைப் பயன்படுத்துதல்'
      ],
      highRisk: 'முதியவர்கள் மற்றும் நாள்பட்ட நோயாளிகள்.',
      whenToSeekCare: 'கடுமையான மூட்டு வலி மற்றும் வீக்கம் ஏற்பட்டால் மருத்துவரை அணுகவும்.'
    }
  },

  malaria: {
    canonicalName: 'Malaria (Elimination Surveillance)',
    icdCodes: ['B50', 'B51', 'B52', 'B53', 'B54'],
    en: {
      about: 'Sri Lanka was certified malaria-free by the WHO in 2016. However, vigilant surveillance is maintained against imported cases (from travelers or migrant workers) and potential resurgence transmitted by local Anopheles mosquitoes.',
      symptoms: [
        'Paroxysms of high fever preceded by severe shaking chills (cold stage)',
        'Hot stage with burning skin, severe headache, and vomiting',
        'Sweating stage with drenching perspiration and rapid defervescence',
        'Fatigue, jaundice, and enlargement of the spleen (splenomegaly)'
      ],
      transmission: 'Bites of infected female Anopheles culicifacies mosquitoes, particularly active between dusk and dawn.',
      prevention: [
        'Obtain prophylactic anti-malarial medication from the Anti-Malaria Campaign before traveling to endemic nations (India, Sub-Saharan Africa)',
        'Report any fever occurring within 1 year of return from an overseas endemic area',
        'Sleep under long-lasting insecticide-treated nets (LLINs)',
        'Report suspected cases immediately to the nearest MOH or hospital for blood smear/RDT screening'
      ],
      highRisk: 'Travelers returning from malaria-endemic regions, gem miners, and security personnel on overseas missions.',
      whenToSeekCare: 'Any person with fever who traveled abroad within the past 12 months MUST request a malaria blood smear (thick and thin film) or RDT at any government hospital.'
    },
    si: {
      about: 'මැලේරියාව (නැවත ඇතිවීම වැළැක්වීමේ නිරීක්ෂණය): ශ්‍රී ලංකාව 2016 දී මැලේරියාවෙන් තොර රටක් ලෙස සහතික කරන ලදී. එහෙත් විදේශයන්ගෙන් පැමිණෙන ආසාදිතයින් මඟින් නැවත මෙරට තුළ රෝගය ව්‍යාප්ත වීම වැළැක්වීමට දැඩි නිරීක්ෂණයක් පවත්වා ගනී.',
      symptoms: [
        'වෙවුලුම සහිත අධික උණ (වරින් වර ඇතිවන උණ)',
        'හිසරදය, වමනය සහ අධික දහඩිය දැමීම',
        'සෙංගමාල ලක්ෂණ සහ අධික තෙහෙට්ටුව'
      ],
      transmission: 'රාත්‍රී කාලයේ දෂ්ට කරන ඇනෝෆිලීස් මදුරුවන් මඟින් බෝවේ.',
      prevention: [
        'මැලේරියාව බහුල රටවල (ඉන්දියාව, අප්‍රිකානු රටවල්) සංචාරය කිරීමට පෙර මැලේරියා මර්දන ව්‍යාපාරයෙන් නොමිලේ ඖෂධ ලබා ගන්න',
        'විදේශයක සංචාරය කර පැමිණ වසරක් ඇතුළත උණ වැළඳුනහොත් මැලේරියා රුධිර පරීක්ෂාවක් කරගන්න'
      ],
      highRisk: 'විදේශ සංචාරකයින් සහ විදේශයන්හි සේවය කර පැමිණි පුද්ගලයින්.',
      whenToSeekCare: 'පසුගිය වසර තුළ විදේශගතව පැමිණි අයෙකුට උණ වැළඳුනහොත් වහාම ළඟම ඇති රජයේ රෝහලට ගොස් මැලේරියා රුධිර පරීක්ෂාවක් (Blood Film) කරගන්න.'
    },
    ta: {
      about: 'மலேரியா (மீண்டும் பரவுவதைத் தடுக்கும் கண்காணிப்பு): இலங்கை 2016 இல் மலேரியா அற்ற நாடாக சான்றளிக்கப்பட்டது. ஆயினும் வெளிநாடுகளிலிருந்து வருவோர் மூலம் மீண்டும் பரவாமல் தடுக்க தீவிர கண்காணிப்பு மேற்கொள்ளப்படுகிறது.',
      symptoms: [
        'நடுக்கத்துடன் கூடிய கடுமையான காய்ச்சல்',
        'தலைவலி, வாந்தி மற்றும் அதிக வியர்வை',
        'சோர்வு'
      ],
      transmission: 'இரவு வேளையில் கடிக்கும் அனோபிலஸ் கொசுக்களால் பரவுகிறது.',
      prevention: [
        'மலேரியா உள்ள நாடுகளுக்கு செல்வதற்கு முன் மலேரியா தடுப்பு மருந்துகளை பெறுதல்',
        'வெளிநாட்டிலிருந்து திரும்பிய பின் காய்ச்சல் ஏற்பட்டால் மலேரியா இரத்தப் பரிசோதனை செய்தல்'
      ],
      highRisk: 'வெளிநாடுகளிலிருந்து திரும்பிய பயணிகள்.',
      whenToSeekCare: 'வெளிநாடு சென்று திரும்பிய ஒரு வருடத்திற்குள் காய்ச்சல் ஏற்பட்டால் உடனடியாக இரத்தப் பரிசோதனை செய்துகொள்ளவும்.'
    }
  }
};

/**
 * Returns generic infection prevention advisory for uncataloged ICD codes.
 */
function getGenericDiseaseAdvisory(diseaseIdentifier) {
  const cleanId = String(diseaseIdentifier || '').trim();
  return {
    canonicalName: cleanId || 'Communicable Disease',
    isGenericFallback: true,
    en: {
      about: `General infectious disease advisory for ${cleanId}. MediSync surveillance detected an unusual clustering of verified clinical cases requiring heightened community awareness.`,
      symptoms: [
        'Persistent or high fever',
        'Generalized weakness, malaise, and fatigue',
        'Localized symptoms specific to the diagnosis (respiratory, gastrointestinal, or systemic)',
        'Loss of appetite and body aches'
      ],
      transmission: 'Transmitted through infectious pathogens (viral, bacterial, or parasitic) via common community exposure pathways.',
      prevention: [
        'Practice rigorous hand hygiene with soap and running water or alcohol-based sanitizer',
        'Consume only clean, boiled drinking water and freshly cooked meals',
        'Avoid close contact with visibly ill individuals and wear masks in crowded settings',
        'Maintain clean living environments and ensure proper waste disposal'
      ],
      highRisk: 'Young children, older adults, pregnant women, and patients with chronic medical conditions.',
      whenToSeekCare: 'Consult a licensed medical doctor or visit the nearest outpatient department (OPD) if symptoms persist beyond 48 hours or worsen rapidly.'
    },
    si: {
      about: `${cleanId} සඳහා පොදු බෝවන රෝග උපදේශනය. සායනික වාර්තා අනුව අසාමාන්‍ය රෝගීන් පොකුරක් නිරීක්ෂණය වී ඇති බැවින් ප්‍රජා දැනුවත්භාවය ඉහළ නැංවීම සඳහා නිකුත් කෙරේ.`,
      symptoms: [
        'නොකඩවා පවතින හෝ අධික උණ',
        'අධික තෙහෙට්ටුව සහ ඇඟපත අප්‍රාණික බව',
        'රෝගයට අදාළ ලක්ෂණ (ශ්වසන, ආමාශයික හෝ ශාරීරික)',
        'කෑම අරුචිය සහ හිසරදය'
      ],
      transmission: 'ප්‍රජාව තුළ වෛරස්, බැක්ටීරියා හෝ වෙනත් ක්ෂුද්‍රජීවී ආසාදන මාර්ග ඔස්සේ බෝවිය හැක.',
      prevention: [
        'සබන් යොදා නිතර දෑත් පිරිසිදු කරගන්න',
        'නටවා නිවාගත් පිරිසිදු පානීය ජලය සහ හොඳින් පිසූ ආහාර පමණක් භාවිත කරන්න',
        'රෝගී පුද්ගලයින්ගෙන් ඈත්ව සිටින්න සහ ජනාකීර්ණ ස්ථානවල මුව ආවරණ පළඳින්න'
      ],
      highRisk: 'කුඩා දරුවන්, වැඩිහිටියන්, ගර්භනී මව්වරුන් සහ නිදන්ගත රෝගීන්.',
      whenToSeekCare: 'රෝග ලක්ෂණ දින 2කට වඩා පවතී නම් හෝ උග්‍ර වේ නම් වහාම ළඟම ඇති රෝහල වෙත යන්න.'
    },
    ta: {
      about: `${cleanId} க்கான பொதுவான தொற்றுநோய் ஆலோசனை. அசாதாரண தொற்று அதிகரிப்பு அவதானிக்கப்பட்டுள்ளதால் இந்த எச்சரிக்கை வெளியிடப்படுகிறது.`,
      symptoms: [
        'தொடர்ச்சியான அதிக காய்ச்சல்',
        'உடல் சோர்வு மற்றும் பலவீனம்',
        'நோய்க்கான குறிப்பிட்ட அறிகுறிகள்',
        'பசியின்மை'
      ],
      transmission: 'வைரஸ் அல்லது பக்டீரியா தொற்றுகள் மூலம் பரவுகிறது.',
      prevention: [
        'கைகளை சுத்தமாக கழுவுதல்',
        'கொதித்தாறிய நீரையே அருந்துதல்',
        'கூட்ட நெரிசலான இடங்களில் முகக்கவசம் அணிதல்'
      ],
      highRisk: 'குழந்தைகள், முதியவர்கள் மற்றும் நாள்பட்ட நோயாளிகள்.',
      whenToSeekCare: 'அறிகுறிகள் தீவிரமடைந்தால் உடனடியாக மருத்துவரை அணுகவும்.'
    }
  };
}

/**
 * Resolves curated disease details from disease name, code, or returns generic fallback.
 */
function resolveDiseaseDetails(diseaseIdentifier) {
  if (!diseaseIdentifier) return getGenericDiseaseAdvisory('Communicable Condition');
  const raw = String(diseaseIdentifier).toLowerCase().trim();
  const cleanCode = raw.replace(/^icd(?:10|11):/, '').replace('.', '');

  for (const [key, entry] of Object.entries(DISEASE_LIBRARY)) {
    if (raw.includes(key)) return entry;
    if (entry.canonicalName.toLowerCase().includes(raw)) return entry;
    if (entry.icdCodes.some(c => {
      const normC = c.toLowerCase().replace('.', '');
      return cleanCode === normC || raw.includes(normC);
    })) {
      return entry;
    }
  }

  // Common aliases
  if (raw.includes('flu') || raw.includes('respiratory')) return DISEASE_LIBRARY.influenza;
  if (raw.includes('rat fever')) return DISEASE_LIBRARY.leptospirosis;
  if (raw.includes('enteric')) return DISEASE_LIBRARY.typhoid;
  if (raw.includes('varicella')) return DISEASE_LIBRARY.chickenpox;
  if (raw.includes('watery diarrhea') || raw.includes('diarrhoea')) return DISEASE_LIBRARY.cholera;

  return getGenericDiseaseAdvisory(diseaseIdentifier);
}

module.exports = {
  CLINICAL_REVIEW_STATUS,
  DISEASE_LIBRARY,
  resolveDiseaseDetails,
  getGenericDiseaseAdvisory,
};