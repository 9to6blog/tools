'use client';
import { useId, useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { estimateFromHistory, jobCost, PRICING_DATE, PRICING_SOURCES, tokenCost, usd, type CostRequest } from '@/lib/pricing';
import type { Job } from '@/lib/types';

function PricingNote() {
  return <p className="help">USD 표준 단가 환산 · 캐시 할인 미적용 · 세금 별도 · 청구서 확정액과 다를 수 있습니다. 단가 확인 {PRICING_DATE}. <a href={PRICING_SOURCES[0]} target="_blank" rel="noreferrer">Flare 공식 가격</a> · <a href={PRICING_SOURCES[1]} target="_blank" rel="noreferrer">Sunburst 공식 가격</a></p>;
}
export function CostEstimate({ jobs, requests }: { jobs: Job[]; requests: CostRequest[] }) {
  const estimate = estimateFromHistory(jobs, requests), id = useId();
  const [assumed, setAssumed] = useState(['', '', '']);
  const manual = assumed.every(v => v.trim() !== '') && requests.length ? tokenCost(requests[0].model, Number(assumed[0]), Number(assumed[1]), Number(assumed[2])) : undefined;
  return <div className="cost-panel" aria-label="생성 전 비용 계산">
    <strong>생성 전 비용 · {requests.length}회 요청</strong>
    {requests.length === 0 ? <p>선택한 요청이 없습니다.</p> : estimate.covered === requests.length ? <>
      <p className="cost-amount">기록 기반 예상 {usd(estimate.usd)}</p>
      <p className="help">같은 모델·품질·API 크기·작업 종류·참조 수의 완료 기록 {estimate.samples}건. 관측 범위 합계 {usd(estimate.minUsd)} ~ {usd(estimate.maxUsd)}. 보장된 상한이 아니며 설명·참조 해상도에 따라 달라집니다.</p>
    </> : <p className="help">같은 조건의 사용량 기록이 {estimate.covered ? `${estimate.covered}/${requests.length}회분만 있어 전체 금액을 예상할 수 없습니다.` : '아직 없어 금액을 예상할 수 없습니다.'} 완료 후 사용량으로 계산합니다.</p>}
    <details><summary>단가 보기 · 예상 토큰 직접 계산</summary>
      <p className="help">100만 토큰당 텍스트 입력 $5 · 이미지 입력 $8 · 이미지 출력 $30. GPT Image 2.5의 품질별 토큰 수는 사전에 확정되지 않습니다. GPT Image 2 계산기는 사용하지 않습니다.</p>
      <p className="help">아래 값은 <b>요청 1회당 직접 가정하는 토큰 수</b>입니다. 참조가 없으면 이미지 입력에 0을 입력하세요. API 요청을 보내지 않습니다.</p>
      <div className="cost-token-inputs">{['텍스트 입력 토큰', '이미지 입력 토큰', '이미지 출력 토큰'].map((label, i) => <div className="field" key={label}><Label htmlFor={`${id}-${i}`}>{label}</Label><Input id={`${id}-${i}`} type="number" min={0} step={1} value={assumed[i]} placeholder="직접 입력" onChange={e => setAssumed(values => values.map((v, n) => n === i ? e.target.value : v))} /></div>)}</div>
      {manual ? <p className="cost-amount" role="status">입력한 가정: 1회 {usd(manual.usd)} · {requests.length}회 {usd(manual.usd * requests.length)}</p> : <p className="help">세 항목에 0 이상의 정수를 입력하면 계산합니다.</p>}
      <PricingNote />
    </details>
  </div>;
}
export function JobCost({ job }: { job: Job }) {
  if (job.model === 'local') return <p className="help">이 작업의 API 비용: $0 · 로컬 처리</p>;
  const cost = jobCost(job);
  return <div className="cost-panel"><strong>이 작업의 사용량 기준 비용</strong>{cost ? <>
    <p className="cost-amount">{usd(cost.usd)}</p><p className="help">텍스트 입력 {cost.textInputTokens.toLocaleString()} · 이미지 입력 {cost.imageInputTokens.toLocaleString()} · 이미지 출력 {cost.imageOutputTokens.toLocaleString()} 토큰</p>
    <p className="help">적용 단가 {cost.pricingDate}{job.cost ? ' · 작업에 저장됨' : ' · 과거 사용량을 현재 단가로 환산'}</p>
  </> : <p className="help">사용량 상세가 없어 산출할 수 없습니다. 실패·응답 중단을 무료로 간주하지 않으며 OpenAI 사용량을 확인해 주세요.</p>}<PricingNote /></div>;
}
export function CostLedger({ jobs }: { jobs: Job[] }) {
  const paid = jobs.filter(j => j.model !== 'local'), known = paid.map(jobCost).filter(c => c !== undefined);
  const total = known.reduce((sum, c) => sum + c.usd, 0);
  return <section className="cost-ledger" aria-label="API 비용 기록">
    <h2>API 비용 기록</h2><p><strong>{usd(total)}</strong> · 산출 가능 {known.length}건 합계 / 미산출 {paid.length - known.length}건</p>
    <p className="help">현재 불러온 최근 작업 최대 100건 기준입니다. 전체 계정 청구액이 아니며, 미산출 작업 비용은 합계에 포함되지 않습니다. 로컬 변환은 무료입니다.</p>
    {!!paid.length && <details><summary>작업별 비용 보기</summary><div className="cost-table-scroll"><table><thead><tr><th>작업</th><th>모델 · 품질</th><th>상태</th><th>USD 환산</th></tr></thead><tbody>{paid.map(j => { const cost = jobCost(j); return <tr key={j.id}><td>{j.prompt.slice(0, 65)}</td><td>{j.model.replace('gpt-image-', '')} · {j.quality}</td><td>{j.status === 'complete' ? '완료' : j.status === 'failed' ? '실패' : '진행 / 응답 확인'}</td><td>{cost ? usd(cost.usd) : '미산출'}</td></tr>; })}</tbody></table></div></details>}
    <PricingNote />
  </section>;
}
