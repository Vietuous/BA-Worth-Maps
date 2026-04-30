/**
 * FILE I/O COMPOSABLE
 *
 * Manages file operations such as exporting and importing graph data in JSON format.
 */
import { useGraphData } from './useGraphData'

export function useFileIO(worthMapComponentRef) {
  const { getGraphData, loadGraphData } = useGraphData()

  /* -------------------------------------------------------------------------- */
  /* --- EXPORT OPERATIONS ---                                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Logic: handleExportJson
   *
   * Triggers the download of the current graph data as a JSON file.
   * The filename includes the current scenario name and a timestamp.
   */
  const handleExportJson = (filename = 'worth-map') => {
    const data = getGraphData()
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    /**
     * Logic: handleImportJson
     *
     * Reads a JSON file selected by the user and loads its content into the graph.
     */
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /* -------------------------------------------------------------------------- */
  /* --- IMPORT OPERATIONS ---                                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Logic: handleImportJson
   * Reads file content as text and passes it to the graph loader.
   */
  const handleImportJson = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result)
        loadGraphData(data)
      } catch (err) {
        alert('Error loading file: ' + err.message)
      }
    }
    reader.readAsText(file)
  }

  /* -------------------------------------------------------------------------- */
  /* --- CLOUD & SHARING UTILITIES ---                                          */
  /* -------------------------------------------------------------------------- */

  /**
   * Logic: handleShare
   *
   * Compresses the graph data using the GZIP algorithm and encodes it
   * into a Base64 string for URL-based sharing.
   */
  const handleShare = async () => {
    const data = getGraphData()
    try {
      const jsonStr = JSON.stringify(data)

      // Compress using GZIP
      const stream = new Blob([jsonStr]).stream().pipeThrough(new CompressionStream('gzip'))
      const compressedResponse = await new Response(stream).arrayBuffer()
      const compressedBase64 = btoa(String.fromCharCode(...new Uint8Array(compressedResponse)))

      const url = new URL(window.location.href)
      url.searchParams.delete('data') // Remove legacy param
      url.searchParams.set('g', compressedBase64) // 'g' for gzip

      navigator.clipboard
        .writeText(url.toString())
        .then(() => {
          alert('Link copied to clipboard! (Compressed)')
        })
        .catch(() => {
          prompt('Copy this link:', url.toString())
        })
    } catch (e) {
      console.error('Error sharing:', e)
      alert('Error generating link (graph might be too large).')
    }
  }

  return {
    handleExportJson,
    handleImportJson,
    handleShare
  }
}
