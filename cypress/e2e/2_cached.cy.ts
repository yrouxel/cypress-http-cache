/// <reference types="cypress" />

context('Cache Verification', () => {
  it('Second Run: Cache Hit - Loads fast (takes < 100ms)', () => {
    cy.visit('/', { timeout: 100 })
  })
})
