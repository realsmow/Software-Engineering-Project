import { parseUserCsv } from './user-csv';

const KU = ['ku.th', 'ku.ac.th'];
const HEAD = 'email,student_id,first_name,last_name,role,group';

describe('parseUserCsv', () => {
  it('reads an Excel file with BOM and CRLF, defaulting role to borrower', () => {
    const text = `\uFEFF${HEAD}\r\nana@ku.th,6510500001,Ana,Lek,,CPE\r\nbo@ku.ac.th,S2,Bo,Dee,staff,\r\n`;
    expect(parseUserCsv(text, KU)).toEqual({
      errors: [],
      users: [
        {
          line: 2,
          email: 'ana@ku.th',
          studentId: '6510500001',
          firstName: 'Ana',
          lastName: 'Lek',
          role: 'borrower',
          group: 'CPE',
        },
        {
          line: 3,
          email: 'bo@ku.ac.th',
          studentId: 'S2',
          firstName: 'Bo',
          lastName: 'Dee',
          role: 'staff',
          group: '',
        },
      ],
    });
  });

  it('collects every problem instead of stopping at the first', () => {
    const text = [
      HEAD,
      'ana@gmail.com,1,Ana,Lek,,',
      'bo@ku.th,2,Bo,,,',
      'cy@ku.th,3,Cy,Ra,admin,',
      'cy@ku.th,4,"Cy, Jr",Ra,,',
      'dee@ku.th,3,Dee,Ma,,',
    ].join('\n');
    const { errors } = parseUserCsv(text, KU);
    expect(errors).toEqual([
      'line 2: ana@gmail.com is not a KU email (ku.th, ku.ac.th)',
      'line 3: email, student_id, first_name and last_name are required',
      'line 4: role must be one of borrower, staff, supervisor',
      'line 5: quotes are not supported',
      'line 6: 3 appears twice',
    ]);
  });

  it('refuses a file without the expected header', () => {
    expect(parseUserCsv('mail,id\nx@ku.th,1', KU).errors).toEqual([
      'line 1: header must start with email,student_id,first_name,last_name',
    ]);
  });
});
