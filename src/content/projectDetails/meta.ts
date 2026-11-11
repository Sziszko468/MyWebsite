import type { ProjectId } from '../projects'
import { tri, type Trilingual } from '../trilingual'

/**
 * What a search result, a browser tab and a shared link say about each project page. It is kept
 * apart from the pages' content on purpose: the title and description are needed on every page of
 * the site (the head is set before a project page's own code has loaded), while the content is only
 * loaded when a project page is opened.
 */
export interface ProjectMeta {
  title: Trilingual
  description: Trilingual
  /** The page's lead screenshot (its gallery's `hero` image: projectDetails.test.ts keeps them equal), for structured data. */
  image: { src: string; width: number; height: number }
}

export const projectMeta: Partial<Record<ProjectId, ProjectMeta>> = {
  spendly: {
    title: tri(
      'Spendly: személyes pénzügyi platform',
      'Spendly: a personal finance platform',
      'Spendly: een persoonlijk financieel platform',
    ),
    description: tri(
      'Spendly esettanulmány: Django REST API-ra épülő személyes pénzügyi platform React webes és Expo mobil klienssel. Architektúra, funkciók és döntések.',
      'Spendly case study: a personal finance platform built on a Django REST API, with a React web app and an Expo mobile app. Architecture, features and decisions.',
      'Spendly-casestudy: een persoonlijk financieel platform op een Django REST API, met een React-webapp en een Expo-mobiele app. Architectuur, functies en beslissingen.',
    ),
    image: { src: '/projects/spendly/dashboard-light.webp', width: 1440, height: 1000 },
  },
  bookinghub: {
    title: tri(
      'BookingHub: időpontfoglaló webalkalmazás',
      'BookingHub: an appointment booking web app',
      'BookingHub: een webapplicatie voor afspraken',
    ),
    description: tri(
      'BookingHub esettanulmány: Next.js időpontfoglaló prototípus nyilvános foglalási űrlappal, e-mail-visszaigazolással és admin felülettel. Mi működik, és mi nem.',
      'BookingHub case study: a Next.js appointment-booking prototype with a public booking form, email confirmation and an admin area. What works and what does not.',
      'BookingHub-casestudy: een Next.js-prototype voor afsprakenboeking met een openbaar boekingsformulier, e-mailbevestiging en een beheeromgeving. Wat werkt en wat niet.',
    ),
    image: { src: '/projects/bookinghub/calendar.webp', width: 1440, height: 900 },
  },
  logistics: {
    title: tri(
      'Logistics Platform: fuvarozás- és flottakezelő rendszer',
      'Logistics Platform: a transport and fleet management system',
      'Logistics Platform: een transport- en vlootbeheersysteem',
    ),
    description: tri(
      'Logistics Platform esettanulmány: szállítmányok, flotta, karbantartás és jelentések egy fiktív fuvarozócégnek, szerepkör-alapú hozzáféréssel és élő frissítéssel. Bemutató projekt.',
      'Logistics Platform case study: shipments, fleet, maintenance and reports for a fictional haulier, with role-based access and live updates. A demonstration project.',
      'Logistics Platform-casestudy: zendingen, vloot, onderhoud en rapporten voor een fictief transportbedrijf, met rolgebaseerde toegang en live updates. Een demonstratieproject.',
    ),
    image: { src: '/projects/logistics-platform/dashboard.webp', width: 1440, height: 900 },
  },
}
