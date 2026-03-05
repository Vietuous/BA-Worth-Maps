import { useGraphData } from './useGraphData'

export function useFileIO(worthMapComponentRef) {
  const { getGraphData, loadGraphData } = useGraphData()

  const handleExportJson = (filename = 'worth-map') => {
    const data = getGraphData()
    const jsonStr = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

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
