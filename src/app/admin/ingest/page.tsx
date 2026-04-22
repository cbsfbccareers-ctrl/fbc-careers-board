import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AdminIngestPage() {
  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
      <Card>
        <CardHeader>
          <CardTitle>Ingest job</CardTitle>
          <CardDescription>
            This hidden route is where new postings are added. The form will
            connect in a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Placeholder: URL submission will go here in Phase 3.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
