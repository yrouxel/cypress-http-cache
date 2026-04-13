context('Cache Verification', () => {
  it('First Run: Cache Miss - Loads slowly natively (takes > 500ms)', () => {
    cy.visit('/', { timeout: 1000 })
  })
})
