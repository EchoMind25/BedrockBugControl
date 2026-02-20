// html2canvas is lazy-loaded in BugReportWidget — declaring minimal types
declare module 'html2canvas' {
  interface Html2CanvasOptions {
    useCORS?: boolean
    allowTaint?: boolean
    scale?: number
    logging?: boolean
    [key: string]: unknown
  }
  function html2canvas(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>
  export default html2canvas
}
