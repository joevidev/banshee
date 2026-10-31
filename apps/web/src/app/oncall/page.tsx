import { OfficeProvider } from "@/lib/office/client"
import { OnCall } from "./OnCall"

export const metadata = { title: "On-call · Banshee" }

export default function OnCallPage() {
  return (
    <OfficeProvider>
      <OnCall />
    </OfficeProvider>
  )
}
