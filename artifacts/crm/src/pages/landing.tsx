import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function LandingPage() {
  return (
    <div className="min-h-[100dvh] flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between border-b">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
            M
          </div>
          <span className="text-xl font-bold tracking-tight">MyCRM</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign In
          </Link>
          <Button asChild>
            <Link href="/sign-up">Get Started</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 bg-gradient-to-b from-background to-muted/20">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter max-w-3xl mb-6">
          Customer relationships, <span className="text-primary">simplified.</span>
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mb-10">
          A modern, fast, and intuitive CRM designed for teams that want to close more deals without the clutter.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 mb-20">
          <Button size="lg" asChild className="text-lg px-8">
            <Link href="/sign-up">Start for free</Link>
          </Button>
          <Button size="lg" variant="outline" asChild className="text-lg px-8">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto text-left">
          <div className="p-6 rounded-2xl bg-card border shadow-sm">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary font-bold text-xl">1</div>
            <h3 className="text-xl font-semibold mb-2">Track Pipeline</h3>
            <p className="text-muted-foreground">Visual drag-and-drop pipeline to move deals through stages and forecast revenue.</p>
          </div>
          <div className="p-6 rounded-2xl bg-card border shadow-sm">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary font-bold text-xl">2</div>
            <h3 className="text-xl font-semibold mb-2">Manage Contacts</h3>
            <p className="text-muted-foreground">Keep all your contacts, companies, and interaction history in one unified view.</p>
          </div>
          <div className="p-6 rounded-2xl bg-card border shadow-sm">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 text-primary font-bold text-xl">3</div>
            <h3 className="text-xl font-semibold mb-2">Engage Leads</h3>
            <p className="text-muted-foreground">Send targeted email campaigns to your segments and track opens and clicks.</p>
          </div>
        </div>
      </main>

      <footer className="border-t py-8 text-center text-muted-foreground text-sm">
        <p>MyCRM &copy; {new Date().getFullYear()}. Built for modern sales teams.</p>
      </footer>
    </div>
  );
}
