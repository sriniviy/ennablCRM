import { SidebarLayout } from "@/components/layout/sidebar-layout";
import { useState, useRef } from "react";
import { useCreateCampaign, useSendCampaign, useListContacts } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { ArrowLeft, Send, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function CampaignNewPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Form state
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Data
  const { data: contacts } = useListContacts({ page: 1, pageSize: 100 });
  const createCampaign = useCreateCampaign();
  const sendCampaign = useSendCampaign();

  const createFnRef = useRef(createCampaign.mutateAsync);
  createFnRef.current = createCampaign.mutateAsync;
  
  const sendFnRef = useRef(sendCampaign.mutateAsync);
  sendFnRef.current = sendCampaign.mutateAsync;

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !subject || !fromName || !fromEmail || !htmlContent) {
      toast({ title: "Validation Error", description: "Please fill out all fields", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleToggleContact = (id: string) => {
    const newSet = new Set(selectedContacts);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedContacts(newSet);
  };

  const handleSelectAll = () => {
    if (!contacts?.data) return;
    if (selectedContacts.size === contacts.data.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(contacts.data.map(c => c.id)));
    }
  };

  const handleSend = async () => {
    if (selectedContacts.size === 0) {
      toast({ title: "No recipients", description: "Please select at least one contact.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const campaign = await createFnRef.current({
        data: { name, subject, fromName, fromEmail, htmlContent }
      });
      
      await sendFnRef.current({
        id: campaign.id,
        data: { recipientContactIds: Array.from(selectedContacts) }
      });
      
      toast({ title: "Campaign Sent!", description: `Sent to ${selectedContacts.size} recipients.` });
      setLocation("/campaigns");
    } catch (error) {
      toast({ title: "Error", description: "Failed to create/send campaign.", variant: "destructive" });
      setIsSubmitting(false);
    }
  };

  return (
    <SidebarLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div>
          <Button variant="ghost" size="sm" onClick={() => step === 2 ? setStep(1) : setLocation("/campaigns")} className="mb-2 -ml-3 text-muted-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> {step === 2 ? "Back to edit" : "Back to campaigns"}
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Create Campaign</h1>
          <p className="text-muted-foreground">
            {step === 1 ? "Design your email content." : "Select recipients and send."}
          </p>
        </div>

        {step === 1 && (
          <form onSubmit={handleNext}>
            <Card>
              <CardHeader>
                <CardTitle>Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="name">Internal Campaign Name</Label>
                  <Input id="name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Q3 Product Update" required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fromName">From Name</Label>
                    <Input id="fromName" value={fromName} onChange={e => setFromName(e.target.value)} placeholder="Acme Inc" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fromEmail">From Email</Label>
                    <Input id="fromEmail" type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="hello@acme.com" required />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject Line</Label>
                  <Input id="subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Check out what's new!" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Email Content (HTML allowed)</Label>
                  <Textarea 
                    id="content" 
                    value={htmlContent} 
                    onChange={e => setHtmlContent(e.target.value)} 
                    placeholder="<h1>Hello!</h1>..." 
                    className="h-64 font-mono text-sm"
                    required 
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t pt-6">
                <Button type="submit">Continue to Recipients</Button>
              </CardFooter>
            </Card>
          </form>
        )}

        {step === 2 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Select Recipients</CardTitle>
              <div className="text-sm text-muted-foreground font-medium">
                {selectedContacts.size} selected
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <div className="bg-muted/50 p-3 flex items-center justify-between border-b">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    {contacts?.data && selectedContacts.size === contacts.data.length ? "Deselect All" : "Select All"}
                  </Button>
                  <span className="text-sm text-muted-foreground mr-2">Showing {contacts?.data?.length || 0} contacts</span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {contacts?.data?.map(contact => {
                    const isSelected = selectedContacts.has(contact.id);
                    return (
                      <div 
                        key={contact.id} 
                        className={`flex items-center justify-between p-3 border-b last:border-0 cursor-pointer hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                        onClick={() => handleToggleContact(contact.id)}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium truncate">{contact.firstName} {contact.lastName}</span>
                          <span className="text-xs text-muted-foreground truncate">{contact.email}</span>
                        </div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between border-t pt-6">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={handleSend} disabled={isSubmitting || selectedContacts.size === 0}>
                {isSubmitting ? "Sending..." : <><Send className="w-4 h-4 mr-2" /> Send Campaign</>}
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </SidebarLayout>
  );
}
