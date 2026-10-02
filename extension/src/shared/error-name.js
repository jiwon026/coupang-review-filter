// 오류 이벤트의 error_name 은 예외의 name 에서 온다. name 은 페이지가 정할 수 있는 문자열이라 길이와 문자에 제한이 없다.
// 영문자만 1~40자일 때만 그대로 쓰고, 그 밖에는 고정된 이름으로 바꾼다. 콘텐츠 스크립트와 백그라운드가 같은 규칙을 쓴다.
export const UNKNOWN_ERROR_NAME = 'Unknown'

const ERROR_NAME_SHAPE = /^[A-Za-z]{1,40}$/

export function safeErrorName(value) {
  return typeof value === 'string' && ERROR_NAME_SHAPE.test(value) ? value : UNKNOWN_ERROR_NAME
}
