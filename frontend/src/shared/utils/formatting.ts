export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value
  // Format as DD-MM-YYYY HH:mm:ss
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  const seconds = String(d.getSeconds()).padStart(2, "0")
  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`
}


