/**
 * 한국인 성의 영문 표기. 국내 학술지는 Crossref·OpenAlex에 저자를 영문으로 올리는 경우가 많아
 * "옥현진"과 "Hyunjin Ok"을 같은 사람으로 보려면 성의 로마자 표기를 알아야 한다.
 */
const SURNAMES: Record<string, string[]> = {
  김: ["kim", "gim", "kym"],
  이: ["lee", "yi", "rhee", "rhie", "ri", "lie", "yee", "rie"],
  박: ["park", "bak", "pak", "bark"],
  최: ["choi", "choe", "chey", "choy"],
  정: ["jung", "jeong", "chung", "joung", "cheong", "jeung", "chong"],
  강: ["kang", "gang"],
  조: ["cho", "jo", "joe", "jho", "chough"],
  윤: ["yoon", "yun", "youn"],
  장: ["jang", "chang"],
  임: ["lim", "im", "yim", "rim", "leem"],
  한: ["han"],
  오: ["oh", "o"],
  서: ["seo", "suh", "so", "seu"],
  신: ["shin", "sin", "sheen"],
  권: ["kwon", "kweon", "gwon", "kwan"],
  황: ["hwang"],
  안: ["ahn", "an"],
  송: ["song"],
  류: ["ryu", "yoo", "yu", "you", "ryoo", "rhyu", "lyu", "rew"],
  유: ["yoo", "yu", "you", "ryu", "yuh"],
  전: ["jeon", "jun", "chun", "chon", "jeun"],
  홍: ["hong"],
  고: ["ko", "go", "koh"],
  문: ["moon", "mun"],
  양: ["yang", "ryang"],
  손: ["son", "sohn"],
  배: ["bae", "bai", "pae"],
  백: ["baek", "paik", "back", "paek", "baik", "beak"],
  허: ["heo", "hur", "huh", "her"],
  남: ["nam"],
  심: ["shim", "sim"],
  노: ["noh", "no", "roh", "ro", "rho"],
  하: ["ha"],
  곽: ["kwak", "gwak"],
  성: ["sung", "seong"],
  차: ["cha"],
  주: ["joo", "ju", "chu", "choo"],
  우: ["woo", "wu"],
  구: ["koo", "ku", "gu", "goo"],
  민: ["min"],
  진: ["jin", "chin"],
  나: ["na", "ra"],
  지: ["ji", "chi"],
  엄: ["eom", "um", "uhm"],
  채: ["chae", "chai"],
  원: ["won", "weon"],
  천: ["cheon", "chun"],
  방: ["bang", "pang"],
  공: ["kong", "gong"],
  현: ["hyun", "hyeon"],
  함: ["ham"],
  변: ["byun", "byeon", "pyun"],
  염: ["yeom", "yum"],
  여: ["yeo", "yuh", "yoh"],
  추: ["choo", "chu"],
  도: ["do", "doh", "toh"],
  소: ["so", "soh"],
  석: ["seok", "suk"],
  선: ["sun", "seon"],
  설: ["seol", "sul"],
  마: ["ma"],
  길: ["gil", "kil"],
  연: ["yeon", "yun"],
  위: ["wi", "wee"],
  표: ["pyo"],
  명: ["myung", "myeong"],
  기: ["ki", "gi"],
  반: ["ban", "pan"],
  왕: ["wang"],
  금: ["keum", "kum", "geum"],
  옥: ["ok", "ock"],
  육: ["yuk", "yook"],
  인: ["in"],
  맹: ["maeng"],
  제: ["je", "jae"],
  모: ["mo"],
  탁: ["tak"],
  국: ["kook", "kuk", "guk"],
  어: ["eo", "uh"],
  은: ["eun"],
  편: ["pyun", "pyeon"],
  용: ["yong"],
  예: ["ye", "yeh"],
  경: ["kyung", "gyeong"],
  봉: ["bong"],
  부: ["boo", "bu"],
  가: ["ka", "ga"],
  복: ["bok"],
  태: ["tae"],
  목: ["mok"],
  형: ["hyung", "hyeong"],
  피: ["pi", "pee"],
  두: ["doo", "du"],
  감: ["kam", "gam"],
  동: ["dong"],
  호: ["ho"],
  범: ["beom", "bum"],
  승: ["seung"],
  상: ["sang"],
  시: ["si", "shi"],
  화: ["hwa"],
  라: ["ra", "la"],
  황보: ["hwangbo"],
  남궁: ["namgung", "namkoong", "namkung"],
  제갈: ["jegal", "chegal"],
  선우: ["sunwoo", "seonu", "sunwu"],
  독고: ["dokgo", "tokko"],
  사공: ["sagong"],
};

/** "옥현진" → { surname: "옥", romans: ["ok","ock"] }. 두 글자 성(황보·남궁 등)도 안다 */
export function koreanSurname(fullName: string): { surname: string; romans: string[] } | null {
  const n = fullName.replace(/\s+/g, "");
  const two = n.slice(0, 2);
  if (n.length >= 3 && SURNAMES[two]) return { surname: two, romans: SURNAMES[two] };
  const one = n.slice(0, 1);
  return SURNAMES[one] ? { surname: one, romans: SURNAMES[one] } : null;
}

/** 영문 표기 저자 이름("Hyunjin Ok", "Ok, H.", "H.-J. Ok")에 이 한국인 성이 들어 있나 */
export function romanizedHas(koreanName: string, romanName: string): boolean {
  const k = koreanSurname(koreanName);
  if (!k) return false;
  const tokens = romanName
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 2);
  return tokens.some((t) => k.romans.includes(t));
}
