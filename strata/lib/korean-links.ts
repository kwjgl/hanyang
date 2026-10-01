/**
 * 국내 학술 사이트의 검색 화면으로 바로 가는 링크.
 * 이 사이트들은 공개 검색 API가 없거나(또는 승인·고정 IP가 필요해서) 링크로 연결한다.
 * 주소 형식은 각 사이트 사정에 따라 바뀔 수 있다.
 */
export interface ExternalSearchLink {
  id: string;
  label: string;
  href: string;
}

export function koreanSearchLinks(query: string): ExternalSearchLink[] {
  const q = encodeURIComponent(query.trim());
  return [
    { id: "kci", label: "KCI", href: `https://www.kci.go.kr/kciportal/po/search/poTotalSearList.kci?searchText=${q}` },
    { id: "riss", label: "RISS", href: `https://www.riss.kr/search/Search.do?isDetailSearch=N&searchGubun=true&query=${q}` },
    { id: "dbpia", label: "DBpia", href: `https://www.dbpia.co.kr/search/topSearch?searchOption=all&query=${q}` },
    { id: "scholar", label: "Google 학술검색", href: `https://scholar.google.com/scholar?hl=ko&q=${q}` },
  ];
}
