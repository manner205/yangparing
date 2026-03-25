# 1819기 양파링 프로젝트

## 프로젝트 개요
고등학교 1819기 동창 모임(12명)의 해외여행 자금 관리 앱.
React + Vite SPA. 배포는 별도 서버 또는 Firebase Hosting 예정.

## 멤버
전진아, 이형석, 장인현, 변영선, 홍대우, 한상민, 이상민, 오지선, 이지은, 김차훈, 배정아, 이영호 (총 12명)

## 핵심 설정
- 접근 코드: `1819`
- 관리자 ID: `manner205` / PW: `!2Dldudgh`
- 총 38회차, 회당 25,000원
- 입금 계좌: 토스뱅크 1002-2535-5608

## 현재 탭 구조 (순서대로)
| key | 라벨 | 아이콘 | 설명 |
|-----|------|--------|------|
| home | 홈 | 🏠 | 요약 대시보드 |
| payments | 납입현황 | 💰 | 38회차 납입 체크 |
| invest | 투자현황 | 📈 | 주식·예금 현황 |
| money | 머니머니 | 💎 | 연금·재테크 정보 공유 |
| vote | 여행정보 | ✈️ | 여행지 투표 및 정보 |

## 데이터 구조
- **납부/투자 데이터**: Google Sheets CSV로 읽기 (read-only)
  - SHEET_ID: `1-6BbzuG1RR10IU8X3U9daL5N5UuvNzTnpAO-5avcKXY`
  - 납입 GID: `0`, 투자 GID: `278279642`
- **투표(vote) 데이터**: 현재 localStorage → Firebase로 이관 예정
- **머니머니(money) 데이터**: 현재 로컬 state → Firebase로 이관 예정

## 기술 스택
- React 19, Vite 8
- 인라인 스타일 (CSS-in-JS 없음, styled-components 없음)
- 외부 라이브러리 최소화 (현재 없음)
- Firebase 추가 예정

## 진행 예정 작업
- [ ] Firebase 프로젝트 설정 및 SDK 설치
- [ ] Firestore 연동: `머니머니` 탭 (게시물 CRUD)
- [ ] Firestore 연동: `여행정보` 탭 (여행지 후보, 투표 데이터)

## 코딩 컨벤션
- 모든 컴포넌트는 App.jsx 단일 파일에 작성 중 (파일 분리 요청 없으면 유지)
- 스타일은 파일 하단 `styles` 객체에 집중 관리
- 관리자 기능은 `isAdmin` prop으로 제어

## 주가 API
- 네이버 금융 프록시: `/naver-finance/api/stock/{code}/basic`
- 10분 주기 자동 갱신
