import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Open roles
        </h1>
        <p className="text-sm text-muted-foreground">
          Jobs across TradFi, DeFi, crypto, and AI infrastructure. Listings
          will load from the database in a later phase.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">No listings yet</CardTitle>
            <CardDescription>
              This grid will show active jobs from Supabase in Phase 4.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Use the admin ingest route to add roles when the pipeline is
              ready.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
