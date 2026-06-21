'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@planisfy/ui/components/accordion'
import { Card } from '@planisfy/ui/components/card'
import Link from 'next/link'

const faqItems = [
  {
    id: 'item-1',
    question: 'Can Planisfy run on our own infrastructure?',
    answer:
      'Yes. Planisfy is designed around hosted workflows with a self-hostable deployment path for teams that need infrastructure control.',
  },
  {
    id: 'item-2',
    question: 'What map services does the platform provide?',
    answer:
      'Planisfy supports style publishing, tile serving, tilequery, geocoding, reverse geocoding, source imports, API keys, and operational job visibility.',
  },
  {
    id: 'item-3',
    question: 'Which clients can consume Planisfy maps?',
    answer:
      'Planisfy publishes MapLibre-compatible style and tile endpoints, so web and native map clients can consume the same delivery surfaces.',
  },
  {
    id: 'item-4',
    question: 'Can teams manage access separately?',
    answer:
      'Yes. Teams can manage scoped API keys, usage, resources, and operational controls without mixing those responsibilities into one surface.',
  },
  {
    id: 'item-5',
    question: 'How do uploaded sources become tilesets?',
    answer:
      'Source uploads flow through processing jobs and promotion steps, giving teams a controlled path from geodata import to production delivery.',
  },
]

export default function FAQs() {
  return (
    <section id="faqs" className="bg-background @container py-24">
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <h2 className="text-balance font-serif text-4xl font-medium">
            Frequently Asked Questions
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-md text-balance">
            Find answers to common questions about operating maps with Planisfy.
          </p>
        </div>
        <Card className="mt-12 p-2 rounded-xl">
          <Accordion type="single" collapsible>
            {faqItems.map((item) => (
              <AccordionItem key={item.id} value={item.id} className="border-b-0 px-4">
                <AccordionTrigger className="cursor-pointer py-4 text-sm font-medium hover:no-underline">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="text-muted-foreground pb-2 text-sm">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
        <p className="text-muted-foreground mt-6 text-center text-sm">
          Need a deployment conversation?{' '}
          <Link href="/contact" className="text-primary font-medium hover:underline">
            Get in touch
          </Link>
        </p>
      </div>
    </section>
  )
}
