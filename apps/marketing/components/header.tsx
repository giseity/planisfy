'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight, Menu, Monitor, Moon, Sun, X } from 'lucide-react'
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react'
import { useTheme } from 'next-themes'

import { PlanisfyLogo } from '@planisfy/ui/components/brand-mark'
import { Button } from '@planisfy/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@planisfy/ui/components/dropdown-menu'
import { cn } from '@planisfy/ui/lib/utils'

import { useMedia } from '@/hooks/use-media'

type HeroHeaderProps = {
  docsHref: string
  signInHref: string
  signUpHref: string
}

export const HeroHeader = ({ docsHref, signInHref, signUpHref }: HeroHeaderProps) => {
  const [menuState, setMenuState] = React.useState(false)
  const [isScrolled, setIsScrolled] = React.useState(false)
  const { scrollY } = useScroll()
  const isLarge = useMedia('(min-width: 64rem)')

  useMotionValueEvent(scrollY, 'change', (latest) => {
    setIsScrolled(latest > 75)
  })

  return (
    <header>
      <nav data-state={menuState && 'active'} className="fixed z-20 w-full">
        <div className="mx-auto max-w-7xl px-6">
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-6 lg:gap-0">
            <div
              className={cn(
                'flex justify-between gap-6 duration-200 max-lg:w-full',
                isScrolled && 'lg:opacity-0 lg:blur-[4px]'
              )}
            >
              <div className="hidden size-fit lg:block">
                <NavItems docsHref={docsHref} />
              </div>
              <Link href="/" aria-label="home" className="flex items-center space-x-2 lg:hidden">
                <PlanisfyLogo markClassName="size-7" />
              </Link>

              <button
                onClick={() => setMenuState(!menuState)}
                aria-label={menuState == true ? 'Close Menu' : 'Open Menu'}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu className="in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0 m-auto size-6 duration-200" />
                <X className="in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100 absolute inset-0 m-auto size-6 -rotate-180 scale-0 opacity-0 duration-200" />
              </button>
            </div>

            {isLarge && (
              <FloatingNavPill
                docsHref={docsHref}
                isScrolled={isScrolled}
                signUpHref={signUpHref}
              />
            )}

            <div className="bg-card ring-border in-data-[state=active]:block lg:in-data-[state=active]:flex mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl p-6 shadow-2xl shadow-zinc-300/20 ring-1 md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:ring-transparent dark:shadow-none dark:lg:bg-transparent">
              <div className="lg:hidden">
                <NavItems docsHref={docsHref} />
              </div>
              <div
                className={cn(
                  'flex w-full flex-col space-y-3 duration-200 sm:flex-row sm:items-center sm:gap-3 sm:space-y-0 md:w-fit',
                  isScrolled && 'lg:opacity-0 lg:blur-[4px]'
                )}
              >
                <ThemeToggle />
                <Button asChild variant="ghost" size="marketing">
                  <a href={signInHref}>
                    <span>Sign in</span>
                  </a>
                </Button>
                <Button asChild size="marketing">
                  <a href={signUpHref}>
                    <span>Get started</span>
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}

const NavItems = ({ docsHref }: { docsHref: string }) => {
  const menuItems = [
    { name: 'Features', href: '/#features' },
    { name: 'Pricing', href: '/pricing' },
    { name: 'Docs', href: docsHref },
    { name: 'Contact', href: '/contact' },
  ]

  return (
    <ul className="flex gap-1 max-lg:flex-col">
      {menuItems.map((item, index) => (
        <li key={index}>
          <Button
            asChild
            variant="ghost"
            size="marketing"
            className="w-full max-lg:h-12 max-lg:justify-start max-lg:text-lg"
          >
            <Link href={item.href} className="text-base">
              <span>{item.name}</span>
            </Link>
          </Button>
        </li>
      ))}
    </ul>
  )
}

const FloatingNavPill = ({
  docsHref,
  isScrolled,
  signUpHref,
}: {
  docsHref: string
  isScrolled: boolean
  signUpHref: string
}) => {
  return (
    <motion.div
      initial={{ background: 'rgba(0, 0, 0, 0)' }}
      animate={{
        gap: isScrolled ? '1rem' : '0rem',
        background: isScrolled ? 'var(--color-card)' : 'rgba(0, 0, 0, 0)',
      }}
      transition={{ duration: 0.5, type: 'spring', bounce: 0.1 }}
      className={cn(
        'absolute inset-0 z-50 m-auto flex size-fit h-14.5 items-center rounded-xl transition-colors duration-500',
        isScrolled && 'ring-border/50 shadow-foreground/6.5 shadow-lg ring-1 backdrop-blur'
      )}
    >
      <Link href="/" aria-label="home" className="px-3.5">
        <PlanisfyLogo markClassName="size-7" />
      </Link>
      <AnimatePresence initial={false}>
        {isScrolled && (
          <motion.div
            initial={{
              opacity: 0,
              x: -156,
              scale: 0.8,
              filter: 'blur(4px)',
              width: 0,
            }}
            animate={{
              opacity: 1,
              x: 0,
              scale: 1,
              filter: 'blur(0px)',
              width: 'auto',
            }}
            exit={{
              opacity: 0,
              x: -156,
              scale: 0.8,
              filter: 'blur(4px)',
              width: 0,
            }}
            transition={{ duration: 0.5, type: 'spring', bounce: 0.1 }}
            className="flex origin-left items-center overflow-hidden rounded-full"
          >
            <>
              <NavItems docsHref={docsHref} />
              <div className="ml-2 flex items-center gap-2 border-l pl-2">
                <ThemeToggle />
                <Button asChild size="marketing" className="mr-2 gap-1 pr-1">
                  <a href={signUpHref}>
                    <span>Get started</span>
                    <ChevronRight className="opacity-50" />
                  </a>
                </Button>
              </div>
            </>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const ThemeToggle = () => {
  const { setTheme, theme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg" className="relative rounded-xl max-lg:size-12">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          Light
          {theme === 'light' && (
            <span className="ml-auto text-xs text-muted-foreground">Active</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
          {theme === 'dark' && (
            <span className="ml-auto text-xs text-muted-foreground">Active</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          System
          {theme === 'system' && (
            <span className="ml-auto text-xs text-muted-foreground">Active</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
