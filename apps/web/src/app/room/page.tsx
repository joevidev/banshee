import { WarRoom } from "@/components/warroom/WarRoom"
import { OfficeProvider } from "@/lib/office/client"

export const metadata = { title: "War room · Banshee" }
export default function RoomPage() {
  return (
    <OfficeProvider>
      <WarRoom />
    </OfficeProvider>
  )
}
