import type { WorkerBatchMessage } from '../../lib/binance/ingestWorkerTypes'

export function createMarketParseWorker(
  onBatch: (data: WorkerBatchMessage) => void,
  onWorkerDisabled: () => void,
): Worker {
  const parserWorker = new Worker(
    new URL('../../workers/marketParse.worker.ts', import.meta.url),
    { type: 'module' },
  )
  parserWorker.onmessage = (ev: MessageEvent<WorkerBatchMessage>) => {
    onBatch(ev.data)
  }
  parserWorker.onerror = () => {
    parserWorker.terminate()
    onWorkerDisabled()
  }
  parserWorker.onmessageerror = () => {
    parserWorker.terminate()
    onWorkerDisabled()
  }
  return parserWorker
}
