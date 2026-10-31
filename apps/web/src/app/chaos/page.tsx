import { OfficeProvider } from "@/lib/office/client"
import { Chaos } from "./Chaos"

export const metadata = { title: "Break production · Banshee" }

export default function ChaosPage() {
  return (
    <OfficeProvider>
      <Chaos />
    </OfficeProvider>
  )
}
